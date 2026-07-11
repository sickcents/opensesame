"""Floor Plan extraction: PDF (first page) -> text-stripped SVG.

POST /api/extract-floor-plan with raw PDF bytes (Content-Type: application/pdf).
Responds 200 {"svg": "<svg ...>"} or 400 {"error": "..."}.

Per ADR-0005 every vector path is kept unchanged; only text-drawing
operations (BT..ET blocks and text-state operators) are removed.
"""

import io
import json
from http.server import BaseHTTPRequestHandler

from pypdf import PdfReader
from pypdf.generic import ContentStream

# Operators dropped entirely (text showing + text state + text positioning).
_TEXT_OPS = {
    b"BT", b"ET",
    b"Tj", b"TJ", b"'", b'"',
    b"Tf", b"Td", b"TD", b"Tm", b"T*",
    b"Tc", b"Tw", b"Tz", b"TL", b"Ts", b"Tr",
}

_IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _mat_mult(m, n):
    """Matrix multiply m x n where each is a PDF matrix (a b c d e f)."""
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def _fmt(v):
    """Compact number formatting for SVG output."""
    r = round(v, 3)
    if r == int(r):
        return str(int(r))
    return f"{r:.3f}".rstrip("0").rstrip(".")


def _gray_to_rgb(g):
    return (g, g, g)


def _cmyk_to_rgb(c, m, y, k):
    return ((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k))


def _rgb_css(rgb):
    r, g, b = (max(0.0, min(1.0, float(v))) for v in rgb)
    return f"rgb({round(r * 255)},{round(g * 255)},{round(b * 255)})"


class _GState:
    __slots__ = ("ctm", "stroke_rgb", "fill_rgb", "line_width")

    def __init__(self, ctm=_IDENTITY, stroke_rgb=(0, 0, 0), fill_rgb=(0, 0, 0),
                 line_width=1.0):
        self.ctm = ctm
        self.stroke_rgb = stroke_rgb
        self.fill_rgb = fill_rgb
        self.line_width = line_width

    def copy(self):
        return _GState(self.ctm, self.stroke_rgb, self.fill_rgb, self.line_width)


def pdf_to_svg(pdf_bytes):
    """Convert the first page of a PDF into a text-stripped SVG string.

    Raises ValueError on malformed/unparseable input.
    """
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            raise ValueError("PDF has no pages")
        page = reader.pages[0]
        mb = page.mediabox
        page_x0 = float(mb.left)
        page_y0 = float(mb.bottom)
        page_w = float(mb.width)
        page_h = float(mb.height)
        contents = page.get_contents()
        operations = (
            ContentStream(contents, reader).operations if contents is not None else []
        )
    except ValueError:
        raise
    except Exception as exc:  # pypdf raises many error types on broken files
        raise ValueError(f"Could not parse PDF: {exc}") from exc

    gs = _GState()
    stack = []

    def dev(x, y):
        """User-space point -> SVG coords (apply CTM, then flip Y)."""
        a, b, c, d, e, f = gs.ctm
        dx = a * x + c * y + e
        dy = b * x + d * y + f
        return dx - page_x0, page_h - (dy - page_y0)

    def ctm_scale():
        """Approximate uniform scale of the CTM, for stroke-width."""
        a, b, c, d, _, _ = gs.ctm
        det = abs(a * d - b * c)
        return det ** 0.5 if det > 0 else 1.0

    paths = []          # emitted <path> elements
    d_parts = []        # current path's d commands
    cur = (0.0, 0.0)    # current point in user space (for v operator)
    start = (0.0, 0.0)  # subpath start in user space

    def emit(fill, stroke, evenodd=False, close_first=False):
        nonlocal d_parts
        if close_first and d_parts and d_parts[-1] != "Z":
            d_parts.append("Z")
        if d_parts:
            attrs = [f'd="{" ".join(d_parts)}"']
            attrs.append(f'fill="{_rgb_css(gs.fill_rgb)}"' if fill else 'fill="none"')
            if fill and evenodd:
                attrs.append('fill-rule="evenodd"')
            if stroke:
                attrs.append(f'stroke="{_rgb_css(gs.stroke_rgb)}"')
                attrs.append(f'stroke-width="{_fmt(max(gs.line_width * ctm_scale(), 0.1))}"')
            paths.append(f"<path {' '.join(attrs)}/>")
        d_parts = []

    def flt(v):
        return float(v)

    in_text = False
    for operands, op in operations:
        if op == b"BT":
            in_text = True
            continue
        if op == b"ET":
            in_text = False
            continue
        if in_text or op in _TEXT_OPS:
            continue

        if op == b"q":
            stack.append(gs.copy())
        elif op == b"Q":
            if stack:
                gs = stack.pop()
        elif op == b"cm":
            m = tuple(flt(v) for v in operands[:6])
            gs.ctm = _mat_mult(m, gs.ctm)
        elif op == b"w":
            gs.line_width = flt(operands[0])
        elif op == b"g":
            gs.fill_rgb = _gray_to_rgb(flt(operands[0]))
        elif op == b"G":
            gs.stroke_rgb = _gray_to_rgb(flt(operands[0]))
        elif op == b"rg":
            gs.fill_rgb = tuple(flt(v) for v in operands[:3])
        elif op == b"RG":
            gs.stroke_rgb = tuple(flt(v) for v in operands[:3])
        elif op == b"k":
            gs.fill_rgb = _cmyk_to_rgb(*(flt(v) for v in operands[:4]))
        elif op == b"K":
            gs.stroke_rgb = _cmyk_to_rgb(*(flt(v) for v in operands[:4]))
        elif op in (b"sc", b"scn", b"SC", b"SCN"):
            nums = [flt(v) for v in operands if isinstance(v, (int, float))]
            rgb = None
            if len(nums) == 1:
                rgb = _gray_to_rgb(nums[0])
            elif len(nums) == 3:
                rgb = tuple(nums)
            elif len(nums) == 4:
                rgb = _cmyk_to_rgb(*nums)
            if rgb is not None:
                if op in (b"sc", b"scn"):
                    gs.fill_rgb = rgb
                else:
                    gs.stroke_rgb = rgb

        # -- path construction ------------------------------------------
        elif op == b"m":
            x, y = flt(operands[0]), flt(operands[1])
            cur = start = (x, y)
            px, py = dev(x, y)
            d_parts.append(f"M {_fmt(px)} {_fmt(py)}")
        elif op == b"l":
            x, y = flt(operands[0]), flt(operands[1])
            cur = (x, y)
            px, py = dev(x, y)
            d_parts.append(f"L {_fmt(px)} {_fmt(py)}")
        elif op == b"c":
            x1, y1, x2, y2, x3, y3 = (flt(v) for v in operands[:6])
            p1, p2, p3 = dev(x1, y1), dev(x2, y2), dev(x3, y3)
            cur = (x3, y3)
            d_parts.append(
                f"C {_fmt(p1[0])} {_fmt(p1[1])} {_fmt(p2[0])} {_fmt(p2[1])} "
                f"{_fmt(p3[0])} {_fmt(p3[1])}"
            )
        elif op == b"v":
            x2, y2, x3, y3 = (flt(v) for v in operands[:4])
            p1, p2, p3 = dev(*cur), dev(x2, y2), dev(x3, y3)
            cur = (x3, y3)
            d_parts.append(
                f"C {_fmt(p1[0])} {_fmt(p1[1])} {_fmt(p2[0])} {_fmt(p2[1])} "
                f"{_fmt(p3[0])} {_fmt(p3[1])}"
            )
        elif op == b"y":
            x1, y1, x3, y3 = (flt(v) for v in operands[:4])
            p1, p3 = dev(x1, y1), dev(x3, y3)
            cur = (x3, y3)
            d_parts.append(
                f"C {_fmt(p1[0])} {_fmt(p1[1])} {_fmt(p3[0])} {_fmt(p3[1])} "
                f"{_fmt(p3[0])} {_fmt(p3[1])}"
            )
        elif op == b"h":
            if d_parts and d_parts[-1] != "Z":
                d_parts.append("Z")
            cur = start
        elif op == b"re":
            x, y, w, h = (flt(v) for v in operands[:4])
            p0, p1, p2, p3 = dev(x, y), dev(x + w, y), dev(x + w, y + h), dev(x, y + h)
            d_parts.append(
                f"M {_fmt(p0[0])} {_fmt(p0[1])} L {_fmt(p1[0])} {_fmt(p1[1])} "
                f"L {_fmt(p2[0])} {_fmt(p2[1])} L {_fmt(p3[0])} {_fmt(p3[1])} Z"
            )
            cur = start = (x, y)

        # -- path painting ----------------------------------------------
        elif op == b"S":
            emit(fill=False, stroke=True)
        elif op == b"s":
            emit(fill=False, stroke=True, close_first=True)
        elif op in (b"f", b"F"):
            emit(fill=True, stroke=False)
        elif op == b"f*":
            emit(fill=True, stroke=False, evenodd=True)
        elif op == b"B":
            emit(fill=True, stroke=True)
        elif op == b"B*":
            emit(fill=True, stroke=True, evenodd=True)
        elif op == b"b":
            emit(fill=True, stroke=True, close_first=True)
        elif op == b"b*":
            emit(fill=True, stroke=True, evenodd=True, close_first=True)
        elif op == b"n":
            d_parts = []  # no-op paint (usually ends a clip); nothing to draw
        # W / W* (clipping), gs, and anything else: no SVG effect here.

    svg_body = "".join(paths)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {_fmt(page_w)} {_fmt(page_h)}">{svg_body}</svg>'
    )


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            pdf_bytes = self.rfile.read(length) if length > 0 else b""
            if not pdf_bytes:
                self._send_json(400, {"error": "Empty request body; expected raw PDF bytes"})
                return
            svg = pdf_to_svg(pdf_bytes)
            self._send_json(200, {"svg": svg})
        except ValueError as exc:
            self._send_json(400, {"error": str(exc)})
        except Exception as exc:
            self._send_json(400, {"error": f"Could not process PDF: {exc}"})
