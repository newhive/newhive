import os, subprocess
from newhive.config import src_home

old_dir = os.getcwd()
os.chdir(src_home)
try:
    current_revision = subprocess.check_output(['git', 'rev-parse', 'HEAD']).strip()
except Exception:
    current_revision = ''
os.chdir(old_dir)
