"""Creates ../assignment3.zip with exactly: docker-compose.yml, .env, PROJECT_INFO.docx (no folder)."""
import os, secrets, subprocess, sys, zipfile

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
out = os.path.join(root, "build")
os.makedirs(out, exist_ok=True)
domain = sys.argv[1] if len(sys.argv) > 1 else ""
env = ("MONGODB_URI=mongodb://mongo:27017\nDB_NAME=focusflow\n"
       f"JWT_SECRET={secrets.token_urlsafe(48)}\nGEMINI_API_KEY=\n")
open(os.path.join(out, ".env"), "w", newline="\n").write(env)
subprocess.check_call([sys.executable, os.path.join(here, "project_info.py"), os.path.join(out, "PROJECT_INFO.docx"), domain])
zpath = os.path.join(root, "assignment3.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(here, "docker-compose.yml"), "docker-compose.yml")
    z.write(os.path.join(out, ".env"), ".env")
    z.write(os.path.join(out, "PROJECT_INFO.docx"), "PROJECT_INFO.docx")
print(zpath, zipfile.ZipFile(zpath).namelist())
