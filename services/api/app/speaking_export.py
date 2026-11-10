"""Export Speaking assessment scores and rubrics in the official ENTs / FPT speaking sheet format."""
import csv
import io
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

RUBRIC_ENT_STANDARDS = [
    {
        "name": "Ideas",
        "levels": [
            "Has no ideas at all, or all or most ideas are off-topic.",
            "Has few ideas but ideas are not organized. Some ideas are off-topic.",
            "Presents relevant ideas but some may be inadequately developed or unclear, or some supporting ideas may lack focus.",
            "Presents a well-developed response with clear organization to the question with relevant, extended and supported ideas.",
        ],
    },
    {
        "name": "Pronunciation",
        "levels": [
            "Pronunciation makes it impossible to understand speech. Or speaks nothing.",
            "Speech is a little hard to be understood due to lots of errors in pronunciation.",
            "Speaks with a clear voice but still in L1 accent. Speech is understandable. Some errors in word pronunciation, stress and sentence intonation may be found.",
            "Speaks with a clear voice and near-native pronunciation, stress and intonation. L1 accent has minimal effects.",
        ],
    },
    {
        "name": "Grammar Range and Accuracy",
        "levels": [
            "Speaks nothing or cannot produce basic sentence forms, or produce basic sentence forms with a lot of grammar mistakes that make it hard to understand the ideas.",
            "Uses only simple sentences with errors. Errors prevent understanding frequently.",
            "Simple sentences are mostly accurate. Some complex sentences are used, but these are limited in range, and they often have noticeable mistakes.",
            "Uses a wide range of structures flexibly. The majority of sentences are error free. A few simple errors may still be present, but they have “little to no” effect on the clarity, comprehensibility, and accuracy of the sentences.",
        ],
    },
    {
        "name": "Vocabulary Range and Accuracy",
        "levels": [
            "Speaks nothing or only produces isolated words or memorized utterances, or uses little vocabulary related to the topic.",
            "Manages to talk about the topic using mainly simple vocabulary. Shows difficulty choosing vocabulary to speak. There are frequent inappropriacies and errors in word choice.",
            "Vocabulary use is sufficient to discuss topics at length. There may be some repetition and sometimes inappropriate word choices, but the overall meaning is clear.",
            "Uses a wide vocabulary resource readily and flexibly to convey precise meaning. Uses less common and idiomatic vocabulary skillfully, with occasional inaccuracies. Uses paraphrase effectively.",
        ],
    },
    {
        "name": "Fluency and coherence",
        "levels": [
            "Maintains a short speech with some simple words or sentences and lots of hesitation to think, or speaks nothing.",
            "Speaks with noticeable effort. Pauses, word repetition, and self-correction often happen. Uses very few linking words.",
            "Can speak for a while and shows a readiness to talk at length. Sometimes loses track due to pausing, repeating, or correcting. Uses linking words to connect ideas when speaking, but not always in the right way.",
            "Speaks fluently with no or occasional repetition or self-correction. Any pauses are just to plan what to say next, not to find the right words. Uses a wide range of appropriate linking words.",
        ],
    },
]


def generate_speaking_xlsx(meta: dict, students: list[dict], rubrics: list[dict] | None = None) -> bytes:
    """Generate professional XLSX file matching Speaking test score sheet template."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Speaking Scores"
    ws.views.sheetView[0].showGridLines = True

    subject_code = meta.get("subject_code") or "ENTs"
    exam_date = meta.get("date") or datetime.now().strftime("%d/%m/%Y")
    teacher = meta.get("teacher") or ""
    exam_time = meta.get("time") or datetime.now().strftime("%H:%M")

    # Font definitions
    title_font = Font(name="Calibri", size=16, bold=True, color="0F766E")
    meta_label_font = Font(name="Calibri", size=11, bold=True, color="334155")
    meta_val_font = Font(name="Calibri", size=11, bold=False, color="0F172A")
    th_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    th_max_font = Font(name="Calibri", size=11, bold=True, italic=True, color="0F766E")
    cell_font = Font(name="Calibri", size=11, color="0F172A")
    total_font = Font(name="Calibri", size=11, bold=True, color="0F766E")

    # Fills
    th_fill = PatternFill("solid", fgColor="0F766E")
    th_max_fill = PatternFill("solid", fgColor="CCFBF1")
    row_even_fill = PatternFill("solid", fgColor="FFFFFF")
    row_odd_fill = PatternFill("solid", fgColor="F8FAFC")

    # Borders
    thin_border_side = Side(border_style="thin", color="CBD5E1")
    cell_border = Border(
        top=thin_border_side,
        left=thin_border_side,
        right=thin_border_side,
        bottom=thin_border_side,
    )

    # Alignments
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    # Row 2: Title
    ws["B2"] = "SPEAKING SCORE SHEET"
    ws["B2"].font = title_font

    # Row 3: Subject & Date
    ws["D3"] = "Subject code:"
    ws["D3"].font = meta_label_font
    ws["D3"].alignment = Alignment(horizontal="right")
    ws["E3"] = subject_code
    ws["E3"].font = meta_val_font

    ws["G3"] = "Date:"
    ws["G3"].font = meta_label_font
    ws["G3"].alignment = Alignment(horizontal="right")
    ws["H3"] = exam_date
    ws["H3"].font = meta_val_font

    # Row 4: Teacher & Time
    ws["D4"] = "Teacher:"
    ws["D4"].font = meta_label_font
    ws["D4"].alignment = Alignment(horizontal="right")
    ws["E4"] = teacher
    ws["E4"].font = meta_val_font

    ws["G4"] = "Time:"
    ws["G4"].font = meta_label_font
    ws["G4"].alignment = Alignment(horizontal="right")
    ws["H4"] = exam_time
    ws["H4"].font = meta_val_font

    # Row 6: Table Headers
    headers = [
        "Rollnumber",
        "Fullname",
        "Ideas",
        "Pronunciation",
        "Grammar",
        "Vocabulary",
        "Fluency and coherence",
        "Total",
        "Note",
    ]
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=6, column=col_idx, value=h)
        cell.font = th_font
        cell.fill = th_fill
        cell.alignment = align_center
        cell.border = cell_border
    ws.row_dimensions[6].height = 26

    # Row 7: Max scores row
    max_scores = ["", "", "2đ", "2đ", "2đ", "2đ", "2đ", "10đ", ""]
    for col_idx, m in enumerate(max_scores, start=1):
        cell = ws.cell(row=7, column=col_idx, value=m)
        cell.font = th_max_font
        cell.fill = th_max_fill
        cell.alignment = align_center
        cell.border = cell_border
    ws.row_dimensions[7].height = 20

    # Student rows (Row 8+)
    current_row = 8
    for idx, s in enumerate(students):
        fill = row_even_fill if idx % 2 == 0 else row_odd_fill

        c_roll = ws.cell(row=current_row, column=1, value=s.get("roll_number", ""))
        c_name = ws.cell(row=current_row, column=2, value=s.get("full_name", ""))
        c_ideas = ws.cell(row=current_row, column=3, value=s.get("ideas"))
        c_pron = ws.cell(row=current_row, column=4, value=s.get("pronunciation"))
        c_gram = ws.cell(row=current_row, column=5, value=s.get("grammar"))
        c_vocab = ws.cell(row=current_row, column=6, value=s.get("vocabulary"))
        c_flu = ws.cell(row=current_row, column=7, value=s.get("fluency"))

        # Total
        tot = s.get("total")
        if tot is not None and isinstance(tot, (int, float)):
            c_tot = ws.cell(row=current_row, column=8, value=round(tot, 2))
        else:
            c_tot = ws.cell(row=current_row, column=8, value=f"=SUM(C{current_row}:G{current_row})")

        c_note = ws.cell(row=current_row, column=9, value=s.get("note", ""))

        c_roll.alignment = align_center
        c_name.alignment = align_left
        c_ideas.alignment = align_center
        c_pron.alignment = align_center
        c_gram.alignment = align_center
        c_vocab.alignment = align_center
        c_flu.alignment = align_center
        c_tot.alignment = align_center
        c_note.alignment = align_left

        for c in (c_roll, c_name, c_ideas, c_pron, c_gram, c_vocab, c_flu, c_tot, c_note):
            c.font = cell_font
            c.fill = fill
            c.border = cell_border

        c_tot.font = total_font
        ws.row_dimensions[current_row].height = 20
        current_row += 1

    # Empty rows before Rubric section
    current_row += 2

    # Rubric title
    rubric_title_cell = ws.cell(row=current_row, column=2, value=f"Rubrics for {subject_code} SpeakingTest")
    rubric_title_cell.font = Font(name="Calibri", size=13, bold=True, color="0F172A")
    current_row += 2

    # Rubric Header Table
    rubric_headers = ["Criteria", "0 - below 0.6", "0.6 - below 1", "1 - below 1.6", "1.6 - 2"]
    for col_idx, rh in enumerate(rubric_headers, start=1):
        cell = ws.cell(row=current_row, column=col_idx, value=rh)
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1E293B")
        cell.alignment = align_center
        cell.border = cell_border

    current_row += 1
    rubric_subheaders = ["", "Insufficient evidence", "Attempt made", "Meets standard", "Exceeds standard"]
    for col_idx, rsh in enumerate(rubric_subheaders, start=1):
        cell = ws.cell(row=current_row, column=col_idx, value=rsh)
        cell.font = Font(name="Calibri", size=10, bold=True, italic=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="334155")
        cell.alignment = align_center
        cell.border = cell_border

    current_row += 1
    rubric_items = rubrics or RUBRIC_ENT_STANDARDS
    for item in rubric_items:
        c_name = ws.cell(row=current_row, column=1, value=item.get("name", ""))
        c_name.font = Font(name="Calibri", size=10, bold=True, color="0F172A")
        c_name.alignment = Alignment(horizontal="left", vertical="top")
        c_name.border = cell_border

        levels = item.get("levels", [])
        for lvl_idx in range(4):
            desc = levels[lvl_idx] if lvl_idx < len(levels) else ""
            c_desc = ws.cell(row=current_row, column=lvl_idx + 2, value=desc)
            c_desc.font = Font(name="Calibri", size=9, color="334155")
            c_desc.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
            c_desc.border = cell_border

        ws.row_dimensions[current_row].height = 65
        current_row += 1

    # Adjust column widths
    col_widths = {
        "A": 16,
        "B": 28,
        "C": 25,
        "D": 25,
        "E": 25,
        "F": 25,
        "G": 22,
        "H": 12,
        "I": 24,
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate_speaking_csv(meta: dict, students: list[dict], rubrics: list[dict] | None = None) -> bytes:
    """Generate CSV representation with UTF-8 BOM for full Vietnamese character compatibility."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")

    subject_code = meta.get("subject_code") or "ENTs"
    exam_date = meta.get("date") or datetime.now().strftime("%d/%m/%Y")
    teacher = meta.get("teacher") or ""
    exam_time = meta.get("time") or datetime.now().strftime("%H:%M")

    # Top header rows matching form
    writer.writerow(["", "", "", "", "", "", "", "", "", ""])
    writer.writerow(["", "SPEAKING", "", "", "", "", "", "", "", ""])
    writer.writerow(["", "", "", "Subject code: ", subject_code, "", "Date: ", exam_date, "", ""])
    writer.writerow(["", "", "", "Teacher:  ", teacher, "", "Time: ", exam_time, "", ""])
    writer.writerow(["", "", "", "", "", "", "", "", "", ""])

    # Table Header
    writer.writerow([
        "Rollnumber",
        "Fullname",
        "Ideas",
        "Pronunciation",
        "Grammar",
        "Vocabulary",
        "Fluency and coherence",
        "Total",
        "Note",
        "",
    ])
    writer.writerow(["", "", "2đ", "2đ", "2đ", "2đ", "2đ", "", "", ""])

    # Student rows
    for s in students:
        tot = s.get("total")
        tot_str = f"{tot:.2f}" if isinstance(tot, (int, float)) else ("0" if tot == 0 else "")
        writer.writerow([
            s.get("roll_number", ""),
            s.get("full_name", ""),
            s.get("ideas", "") if s.get("ideas") is not None else "",
            s.get("pronunciation", "") if s.get("pronunciation") is not None else "",
            s.get("grammar", "") if s.get("grammar") is not None else "",
            s.get("vocabulary", "") if s.get("vocabulary") is not None else "",
            s.get("fluency", "") if s.get("fluency") is not None else "",
            tot_str,
            s.get("note", ""),
            "TRUE" if (isinstance(tot, (int, float)) and tot >= 5) else "FALSE",
        ])

    # Empty spacer rows
    writer.writerow(["", "", "", ""])
    writer.writerow(["", f"Rubrics for {subject_code}  SpeakingTest ", "", ""])
    writer.writerow(["", "", "", ""])
    writer.writerow(["", "", "", ""])

    # Rubric Table
    writer.writerow(["Criteria", "0 - below 0.6", "0.6 - below 1", "1 - below 1.6", "1.6 - 2"])
    writer.writerow(["", "Insufficient evidence", "Attempt made", "Meets standard", "Exceeds standard"])

    rubric_items = rubrics or RUBRIC_ENT_STANDARDS
    for item in rubric_items:
        lvls = item.get("levels", [])
        writer.writerow([
            item.get("name", ""),
            lvls[0] if len(lvls) > 0 else "",
            lvls[1] if len(lvls) > 1 else "",
            lvls[2] if len(lvls) > 2 else "",
            lvls[3] if len(lvls) > 3 else "",
        ])

    # Return with UTF-8 BOM so Microsoft Excel on Windows renders Vietnamese correctly
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")
