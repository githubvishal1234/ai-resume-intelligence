"""Builds small resume files in memory for upload tests."""

from __future__ import annotations

import io
import zipfile

import docx
from pypdf import PdfWriter

SAMPLE_TEXT = """Priya Raman
Bengaluru, India | priya.raman@example.com | +91 98765 43210 | linkedin.com/in/priyaraman

SUMMARY
Backend engineer with 6 years of experience building data-heavy Python services and APIs.

EXPERIENCE
Senior Software Engineer | Acme Analytics | Bengaluru, India
Jan 2021 - Present
- Led migration of the reporting pipeline to PostgreSQL, cutting query latency by 40%.
- Designed a FastAPI service handling 2M requests/day with 99.95% uptime.
Software Engineer | Brightpath Labs
Jun 2018 - Dec 2020
- Built ETL jobs in Python and Airflow processing 500 GB daily.
- Reduced cloud costs by 25% by rightsizing Kubernetes workloads.

EDUCATION
Bachelor of Technology in Computer Science
National Institute of Technology, Trichy | 2014 - 2018

SKILLS
Languages: Python, SQL, Go
Tools: Docker, Kubernetes, Terraform, Git
"""


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(text: str = SAMPLE_TEXT) -> bytes:
    """A minimal valid one-page PDF whose text layer is `text`."""
    lines = text.splitlines()
    ops = ["BT", "/F1 10 Tf", "12 TL", "50 780 Td"]
    for line in lines:
        ops.append(f"({_escape(line)}) Tj T*")
    ops.append("ET")
    stream = "\n".join(ops).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
              .encode())
    return out.getvalue()


def make_encrypted_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.encrypt("secret")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def make_docx(text: str = SAMPLE_TEXT) -> bytes:
    document = docx.Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    out = io.BytesIO()
    document.save(out)
    return out.getvalue()


def make_docm() -> bytes:
    """A DOCX that carries a VBA project (macro-enabled)."""
    source = zipfile.ZipFile(io.BytesIO(make_docx()))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as target:
        for item in source.infolist():
            target.writestr(item, source.read(item.filename))
        target.writestr("word/vbaProject.bin", b"\x00macro")
    return out.getvalue()
