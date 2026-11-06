"""Builds PROJECT_INFO.docx (Hebrew, RTL) with the exact fields/rows of the course template."""
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

DOMAIN = sys.argv[2] if len(sys.argv) > 2 else ""

SECTIONS = [
    ("פרטים כלליים", [
        ("project_name", "שם הפרויקט", "", "פורחים (Bloom) — גינת ריכוז אישית"),
        ("authors", "המגישים", "אימייל grunitech של כל מגיש מופרדים בפסיק, בלי רווחים",
         "ahuva.fogel@grunitech.com,shani.olshtein@grunitech.com,michal.david@grunitech.com"),
        ("one_sentence_description", "תיאור במשפט", "מה האתר עושה, במשפט אחד",
         "אתר למידה שמודד ריכוז מהמצלמה בדפדפן, וכל סשן לימוד שותל צמח שגדל רק בזמן שהלומד/ת באמת מרוכז/ת — עד גינה שלמה של נושאים."),
    ]),
    ("תוכן", [
        ("main_content_type", "סוג התוכן העיקרי", "video / text / web page / pdf / אחר", "video (YouTube)"),
        ("what_is_a_content_item", "מהו פריט תוכן", "",
         "פריט בספרייה עם כותרת, סוג, מקור ו'ערוגה' (נושא) אופציונלית. נתמכים 3 סוגים: סרטון YouTube (קישור), טקסט שהמשתמש מדביק (תצוגת קריאה), וקישור לדף אינטרנט (iframe + כפתור 'פתח בחלון חדש')."),
        ("sample_content_type", "סוג תוכן הדוגמה", "", "video (YouTube)"),
        ("sample_content_for_testing", "תוכן לדוגמה לבדיקה", "",
         "https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
        ("interface_language", "שפת הממשק", "hebrew / english / both", "hebrew"),
    ]),
    ("טכנולוגיה", [
        ("backend_framework", "טכנולוגיית שרת", "", "Python 3.12 + FastAPI (uvicorn), Motor (MongoDB async), Pydantic v2"),
        ("frontend_framework", "טכנולוגיית לקוח", "", "React 18 + Vite + TypeScript, מוגש ע\"י nginx (שגם מעביר את /api ו-/health לשרת)"),
        ("database", "מסד נתונים", "", "MongoDB 7 כקונטיינר ב-Compose עם named volume (mongo-data)"),
        ("what_is_measured", "מה נמדד", "",
         "קשב (מודל הקשב המומלץ). ציון 0–1: ~0.05 לא בפריים, 0.30 לא קשוב, 0.50 קשב חלש, 0.70 קשוב, 0.95 קשוב מאוד. באתר: אדום < 0.4, צהוב < 0.7, ירוק מ-0.7. ציון ≥ 0.5 נחשב 'זמן מרוכז' שמגדל את הצמח."),
        ("models_used", "המודלים שבשימוש", "",
         "בדפדפן בלבד: MediaPipe FaceLandmarker (@mediapipe/tasks-vision, 478 נקודות, 10 פריימים בשנייה) + v4_2.onnx ב-onnxruntime-web (WASM). חלון של 100 פריימים (10 שניות) בצורה [1,100,478,3], הרצה כל ~3 שניות. קבצי המודל וה-WASM ארוזים בתוך אימג' הלקוח (לא תלויים ב-CDN)."),
        ("model_highlights", "מה מיוחד במודל אצלכם", "",
         "1) משתמשים בכל שלושת הפלטים של v4_2: regression_scores לציון, ו-attention_weights מוצגים כמפת חום 'אילו שניות נחשבו הכי הרבה' בכל סשן וביומן. "
         "2) הציון הופך לצמח חי (גדל/עומד/קמל/ישן) — השלב מחושב בשרת מתוך המדידות ולא מהלקוח. "
         "3) שמירה על ציר זמן אמיתי של 10fps גם במחשב איטי (שכפול הפריים האחרון בפריימים שהוחמצו), טעינה מוקדמת של המודלים בזמן מסך ההסכמה, ו-CPU delegate כדי שהציון הראשון יגיע תוך ~12 שניות גם במכונה בלי GPU. "
         "4) בדקנו את כל 9 המודלים מול הקלטה אמיתית שלנו והשווינו עיבודים מקדימים (נקודות גולמיות מול חיתוך פנים 20%)."),
        ("changes_to_recommended_api", "שינויים ב-API המומלץ", "",
         "תוספות בלבד (שום נתיב/שדה בסיס לא שונה): שדה אופציונלי bed בתוכן; שדה אופציונלי room_code ביצירת סשן; readings מקבל attention אופציונלי (100 ערכים) ומחזיר בנוסף focused_seconds/level/stage/blooms; "
         "GET /api/garden, GET /api/journal, GET /api/badges; חדרי לימוד: POST /api/rooms, POST /api/rooms/{code}/join, POST /api/rooms/{code}/leave, GET /api/rooms/{code}, POST /api/rooms/{code}/cheer, POST /api/rooms/{code}/presence."),
    ]),
    ("שימוש באתר", [
        ("how_to_register", "איך נרשמים", "",
         "בדף הבית לוחצים 'הרשמה', ממלאים שם תצוגה, אימייל וסיסמה (לפחות 8 תווים) ← מועברים ל'התחברות'."),
        ("what_is_a_session", "מהו סשן אצלכם", "",
         "same (פעם אחת של צפייה/קריאה בפריט תוכן). בנוסף: כל סשן 'שותל' צמח שנשמר בגינה אחרי הסיום."),
        ("how_to_start_a_session", "איך מתחילים סשן", "",
         "הספרייה ← 'הוספת תוכן' (כותרת, סוג, קישור) ← 'פתח' ← 'התחל סשן' ← מסך הסכמה ← 'אני מסכים'."),
        ("camera_notes", "המצלמה", "",
         "המצלמה מופעלת רק אחרי לחיצה על 'אני מסכים'. ברירת מחדל = המצלמה הראשונה, ויש רשימה נפתחת 'מצלמה' לבחירת מצלמה אחרת (כולל וירטואלית/OBS). סירוב ('לא, תודה') מאפשר להמשיך לצפות בלי מדידה, עם הסבר. בלי פנים מוצג 'לא זוהו פנים', המודל לא רץ ושום דבר לא נשלח."),
        ("where_the_score_appears", "איפה מופיע הציון", "",
         "במסך הצפייה, בכרטיס שמימין לתוכן: מספר גדול (0.00–1.00), פס צבעוני (אדום < 0.4, צהוב < 0.7, ירוק) ותווית מילולית, מתחתיו גרף חי. מעל הציון — הצמח החי."),
        ("seconds_until_first_score", "שניות עד הציון הראשון", "בערך, בשניות", "12"),
        ("low_focus_reaction", "תגובה לקשב נמוך", "",
         "ציון < 0.4: מיד מופיעה התראה 'הריכוז ירד' והצמח קמל קלות. אם הציון נשאר < 0.4 כ-15 שניות: באנר 'הצמח שלך צמא לריכוז 🌱', ובסרטון YouTube עצירה אוטומטית (אם המשתמש סימן). חזרה לריכוז ← 'הצמח התעורר!' עם אנימציה."),
        ("how_to_end_a_session", "איך מסיימים סשן", "",
         "כפתור 'סיים סשן' ← הודעת סיכום (מספר מדידות וממוצע). הסשן מופיע ב'הגינה שלי · היסטוריה' (גם כצמח בגינה וגם בטבלה: תאריך, תוכן, משך, מדידות, ממוצע); לחיצה פותחת גרף ורשימת מדידות."),
    ]),
    ("הרצה", [
        ("run_command", "פקודת הרצה", "ברירת מחדל: docker compose up", "docker compose up"),
        ("setup_notes", "הערות להפעלה", "",
         "האימג'ים ציבוריים ב-Docker Hub (ahuvafogel/bloom-server, ahuvafogel/bloom-client, linux/amd64) — אין צורך בבנייה. האתר: http://localhost:3000, השרת: http://localhost:8000/health. "
         "בפעם הראשונה המודל (~16MB) נטען לדפדפן ונשמר במטמון. האתר עובד בלי GEMINI_API_KEY (לא בשימוש)."
         + (f" גרסת הענן (מטלה 4): {DOMAIN}" if DOMAIN else "")),
    ]),
    ("אבטחה והגנה על נתונים", [
        ("password_storage", "שמירת סיסמאות", "",
         "bcrypt (ספריית bcrypt בפייתון) עם cost factor 12 ו-salt אקראי לכל סיסמה. רק ה-hash נשמר ב-MongoDB; הסיסמה וה-hash אף פעם לא מוחזרים ב-API ולא נכתבים ללוג."),
        ("password_rules", "כללי סיסמה", "",
         "מינימום 8 תווים, מקסימום 128 (Pydantic, השרת מחזיר 422 עם הודעה). בטופס: מד חוזק חי (ממליץ על 12+ תווים עם אותיות, ספרות וסימנים). שינוי סיסמה מחייב את הסיסמה הנוכחית (400 אם שגויה)."),
        ("token_handling", "טיפול בטוקן", "",
         "JWT HS256 חתום ב-JWT_SECRET (אקראי, 64 תווים), תוקף 60 דקות, נשלח ב-Authorization: Bearer ונשמר ב-localStorage. בהתנתקות ה-jti נכנס ל-denylist ב-MongoDB עם TTL index עד פקיעת הטוקן. "
         "שינוי סיסמה מעלה token_version של המשתמש וכל הטוקנים הישנים נדחים (401). טוקן שפג ← 401 ← הלקוח מנקה את הטוקן ומעביר להתחברות."),
        ("access_control", "בקרת גישה", "",
         "כל נתיב חוץ מ-/health, register ו-login דורש Bearer. השרת מאמת חתימה, תוקף, jti מול ה-denylist ו-token_version מול המשתמש. בלי טוקן / טוקן לא תקין / מבוטל ← 401 {\"detail\": ...}."),
        ("data_isolation", "הפרדת נתונים", "",
         "user_id נלקח רק מהטוקן; כל שאילתה ב-content/sessions/readings מסננת לפי user_id + _id. פריט של משתמש אחר (או מזהה לא תקין) ← 404 'לא נמצא' (לא 403, כדי לא לחשוף קיום). חדרי לימוד: רק חברים יכולים לקרוא חדר (אחרת 404), ומשותפים רק שם תצוגה, ציון ושלב צמח."),
        ("input_validation", "אימות קלט", "",
         "Pydantic v2 בכל הבקשות: EmailStr, אורכי מחרוזות (כותרת ≤ 200, טקסט ≤ 100K, שם ≤ 50), score בין 0 ל-1, type מתוך רשימה סגורה. קישורי YouTube מאומתים מול רשימת דומיינים + מזהה 11 תווים; web רק http/https (חוסם javascript:). "
         "MongoDB דרך Motor עם שאילתות מובנות (בלי הרכבת מחרוזות) ← אין הזרקה. React מבצע escaping לכל טקסט, אין dangerouslySetInnerHTML; דפי web ב-iframe עם sandbox ו-referrerPolicy=no-referrer; כותרות nosniff ו-Referrer-Policy ב-nginx. "
         "הגבלת גודל בקשה 2MB. CORS מוגבל ל-http://localhost:3000."),
        ("camera_and_face_data", "נתוני מצלמה ופנים", "",
         "המצלמה נפתחת רק אחרי מסך הסכמה ('אני מסכים'). הווידאו ו-478 נקודות הפנים מעובדים בדפדפן בלבד (MediaPipe + onnxruntime-web) ולא יוצאים ממנו. לשרת נשלחים רק ציון (0–1), מיקום בתוכן ו-100 משקלי attention של המודל (בלי נקודות פנים). "
         "המצלמה נכבית בסיום סשן, ביציאה מהדף ובהפסקה. מחיקת חשבון מוחקת את כל התוכן, הסשנים והמדידות."),
        ("secrets_handling", "ניהול סודות", "",
         "סודות רק ב-.env (MONGODB_URI, DB_NAME, JWT_SECRET, GEMINI_API_KEY ריק) שנטען ע\"י docker compose. .env ב-.gitignore, לא בקוד, לא באימג'ים ולא ב-GitHub. בענן (מטלה 4): Google Secret Manager."),
        ("extra_account_security", "אבטחת חשבון נוספת", "",
         "JWT_SECRET אקראי; הגבלת ניסיונות התחברות: 5 כישלונות ל-15 דקות לכל צירוף אימייל+IP ← 429 (נשמר ב-MongoDB עם TTL, עובד גם עם כמה שרתים); מד חוזק סיסמה; ביטול טוקנים בהחלפת סיסמה; מחיקת חשבון עם אישור כתוב."),
    ]),
    ("מצב הפרויקט", [
        ("works_fully", "מה עובד במלואו", "",
         "הרשמה, התחברות, התנתקות, ספרייה (YouTube/טקסט/דף אינטרנט), סשן עם הסכמה ובחירת מצלמה, ציון חי, 'לא זוהו פנים', סיום סשן, היסטוריה עם גרף, הפרדת משתמשים, פרופיל (שם, סיסמה, מחיקת חשבון), הצמח החי, הגינה והערוגות, הפסקה מתוגמלת, יומן הגינה, תגים, לומדים ביחד (חדרים), מובייל ומצב לילה"),
        ("partially_works_or_missing", "מה עובד חלקית או חסר", "",
         "v4_2 נותן על ההקלטות שבדקנו ציונים נמוכים ויציבים יחסית (~0.15–0.25) גם כשמסתכלים למסך, ולכן הצמח גדל לאט מאוד והפסקה (פריחה מלאה, ~24 דקות מרוכזות) נדירה. "
         "דפי אינטרנט רבים חוסמים הצגה ב-iframe — יש כפתור 'פתח בחלון חדש' והמיקום נמדד אז לפי זמן. אין אישור אימייל ואין תוסף דפדפן."),
        ("known_issues", "תקלות ידועות", "",
         "אם סקריפט ה-IFrame API של YouTube חסום ברשת, מוצג נגן מוטמע רגיל והמיקום נמדד לפי זמן שעבר (במקום currentTime)."),
    ]),
    ("הפרויקט שלכם", [
        ("plugin", "תוסף Plugin (בונוס)", "", "none"),
        ("extra_features", "תוספות מעבר לבסיס", "",
         "צמח חי שגדל רק בזמן ריכוז (שלב מחושב בשרת); תגובה לקשב נמוך (באנר + עצירת YouTube אופציונלית + החייאה); 'הגינה שלי' — סוג צמח לפי סוג תוכן, גובה לפי דקות ריכוז, צבע לפי ממוצע; ערוגות לפי נושא; הפסקה של 5 דקות על כל פריחה (מצלמה כבויה); "
         "יומן הגינה (דקות ב-14 ימים, שעה הכי טובה, ממוצע לפי ערוגה, רצף ימים, מפת חום של attention_weights, טיפים); עונות ותגים; 'לומדים ביחד' — חדר עם קוד/קישור, צמחי חברים וסטטוס חי, 'שלח עידוד', פריחה משותפת; פרופיל ומחיקת חשבון; מובייל ומצב לילה."),
        ("what_makes_it_yours", "מה הופך אותו לשלכם", "",
         "פורחים לא מראה רק מספר — הוא הופך ריכוז למשהו שמגדלים ודואגים לו: כל סשן שותל זרע שגדל רק כשמרוכזים, נרדם כשהולכים, וצמא כשנודדים. הגינה, הערוגות, ההפסקות שמרוויחים והלמידה המשותפת עם חברים — מוצר שלם עם שם, מותג וסיפור משלו."),
    ]),
]


def rtl(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    bidi.set(qn("w:val"), "1")
    pPr.append(bidi)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in paragraph.runs:
        rPr = run._r.get_or_add_rPr()
        r = OxmlElement("w:rtl")
        r.set(qn("w:val"), "1")
        rPr.append(r)


def table_rtl(table):
    tblPr = table._tbl.tblPr
    bv = OxmlElement("w:bidiVisual")
    tblPr.append(bv)


def main(out):
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name = "Arial"
    st.font.size = Pt(10)
    for text, size, bold in [("Google  |  Reichman University  |  AI Tech School", 9, False), ("Power Tech 2026", 9, False),
                             ("מטלה 3 — קובץ מידע על הפרויקט (PROJECT_INFO)", 16, True)]:
        p = doc.add_paragraph()
        r = p.add_run(text)
        r.font.size = Pt(size)
        r.bold = bold
        rtl(p)
    for title, rows in SECTIONS:
        h = doc.add_heading(title, level=2)
        rtl(h)
        t = doc.add_table(rows=1, cols=3)
        t.style = "Table Grid"
        table_rtl(t)
        for i, name in enumerate(["שדה", "הסבר", "התשובה שלכם"]):
            c = t.rows[0].cells[i]
            c.text = ""
            r = c.paragraphs[0].add_run(name)
            r.bold = True
            rtl(c.paragraphs[0])
        for field, label, hint, answer in rows:
            cells = t.add_row().cells
            cells[0].text = ""
            cells[0].paragraphs[0].add_run(field).bold = True
            cells[0].add_paragraph(label)
            cells[1].text = hint
            cells[2].text = answer
            for c in cells:
                for p in c.paragraphs:
                    rtl(p)
    p = doc.add_paragraph("תודה! הקובץ הזה נקרא לפני כל בדיקה, ולכן שווה למלא אותו בקפידה.")
    rtl(p)
    doc.save(out)


if __name__ == "__main__":
    main(sys.argv[1])
