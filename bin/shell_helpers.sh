#! /bin/bash
# Usage: add the following line to your ~/.bashrc
# source ~/src/newhive/newduke/bin/git_grep_nd.sh

source $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/git_grep.sh

filter_broken="${filter_broken}|/titanium/|history/history|/jquery-1|/old|/broken|/curl|google_closure.js|/d3/|codemirror.js|jquery-ui|/jquery/|/codemirror/|mobile/|zepto-"

alias a="git_grep -o"
alias n='a -o -n'
alias nh='a -o -p "*.html" -n'
alias ns='a -o -p "*.scss" -n'
alias np='a -o -p "*.py" -n'
alias nj='a -o -p "*.js" -n'
alias ah='a -o -p "*.html"'
alias as='a -o -p "*.scss"'
alias ap='a -o -p "*.py"'
alias aj='a -o -p "*.js"'
alias ad=grep_python_def

alias o='open_nth'
alias o1='o 1'
alias o2='o 2'
alias o3='o 3'
alias o4='o 4'
alias o5='o 5'

alias nnn=matched_file_and_line
alias nn=matched_file
# rerun last list 
alias on=rerun_results
# rerun last list, but only accept matches in last file part
alias oe=filepart_results
# rerun last list, filtered through grep
alias og=grep_results

# git root dir
alias groot="git rev-parse --show-toplevel"
alias cdg='cd $(groot)'
alias routes='e `groot`/newhive/routes.json'
alias ff='find|grep -i'
alias config='e $(groot)/newhive/config/config.py'
alias config_common='e $(groot)/newhive/config/config_common.py'

# server management
psk(){
   if pgrep -f $1; then
       pgrep -f $1 | xargs kill;
   else
       return 1;
   fi
} 
alias newhive='(cdg; ./server.py)'
alias killserver='psk server.py'
alias rrr='reset; cdg; killserver; newhive'

