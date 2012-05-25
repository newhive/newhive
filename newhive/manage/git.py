from os.path import join
import os, subprocess
from newhive import config
import re

git_cmd = ['git', '--git-dir=' + join(config.src_home, '.git'), '--work-tree=' + config.src_home]
try:
    current_revision = subprocess.check_output(git_cmd + ['rev-parse', 'HEAD']).strip()
except Exception:
    current_revision = ''

## gets the last modified time of a given file from git, if not in git, return filesystem mtime
## Works, but is painfully slow for many files
#def get_commit_time(path):
#    ts = subprocess.check_output(git_cmd + ['log', 'HEAD', '--pretty=format:%ct', '--date=rfc', '-1', '--', os.path.abspath(path)])
#    if ts: return ts
#    return str(int(os.stat(path).st_mtime))
#
#
## get last modified time for all files in given directory path
## return dictionary of { name : timestamp }, where name is relative to path
#def get_commit_times(path):
#    path = os.path.normpath(path)
#    # get time of each commit, followed by filenames, example:
#    # "//1333757666\nlib/skin/1/log_in_overlay.png\nlib/skin/1/logo_beta.png\n\n//1333757621\n1333756562\nlib/scss.css\n"
#    lines = subprocess.check_output(git_cmd + ['log', '--name-only', '--pretty=format://%ct', '--', path]).split('\n')
#    times = {}
#    time = 0
#    strip = len(path) + 1
#    for l in lines:
#        if l:
#            if re.match('//\d+$', l): time = int(l[2:])
#            else:
#                name = l[strip:]
#                if not times.has_key(name) or times.get(name) < time: times[name] = time
#    return times
