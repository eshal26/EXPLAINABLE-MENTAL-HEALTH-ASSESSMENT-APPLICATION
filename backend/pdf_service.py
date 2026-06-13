import tempfile
from html import escape

from fastapi.responses import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer
from report import REPORT_SECTIONS


def _format_prediction(result: dict) -> str:
    prediction = result.get("prediction") or {}
    if isinstance(prediction, dict):
        label = prediction.get("label") or prediction.get("raw_label") or "Unknown"
        confidence = prediction.get("confidence")
    else:
        label = str(prediction)
        confidence = result.get("confidence")

    if confidence is None:
        return f"Model Prediction: <b>{escape(str(label))}</b>"

    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        return f"Model Prediction: <b>{escape(str(label))}</b>"

    if 0 <= confidence_value <= 1:
        confidence_value *= 100

    return (
        f"Model Prediction: <b>{escape(str(label))}</b> "
        f"({confidence_value:.1f}% confidence)"
    )


def _iter_report_sections(report: dict | str | None):
    if isinstance(report, dict):
        for key, heading in REPORT_SECTIONS:
            yield heading, str(report.get(key) or "")
        raw_text = report.get("raw_report_text")
        if raw_text and not any(report.get(key) for key, _ in REPORT_SECTIONS):
            yield "Clinical Report", str(raw_text)
        return

    if report:
        yield "Clinical Report", str(report)


def build_pdf_response(result: dict, report: dict | str | None) -> FileResponse:
    subject = str(result.get("subject_id") or "Unknown subject")
    tmp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_pdf.close()

    doc = SimpleDocTemplate(
        tmp_pdf.name,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle(
        "Title",
        parent=styles["Title"],
        fontSize=16,
        spaceAfter=6,
    )
    h1_style = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontSize=13,
        textColor=colors.HexColor("#1a4b8c"),
        spaceAfter=4,
        spaceBefore=12,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=15,
        spaceAfter=6,
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.grey,
    )

    story.append(Paragraph("MentalMetrics EEG Analysis Report", title_style))
    story.append(Paragraph(f"Subject ID: {escape(subject)}", meta_style))
    story.append(Paragraph(_format_prediction(result), meta_style))
    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Spacer(1, 0.3 * cm))

    for heading, content in _iter_report_sections(report):
        story.append(Paragraph(heading, h1_style))
        for paragraph in content.split("\n\n"):
            if paragraph.strip():
                story.append(
                    Paragraph(escape(paragraph.strip()).replace("\n", " "), body_style)
                )
        story.append(Spacer(1, 0.2 * cm))

    doc.build(story)

    return FileResponse(
        tmp_pdf.name,
        media_type="application/pdf",
        filename=f"MentalMetrics_Report_{subject}.pdf",
    )
