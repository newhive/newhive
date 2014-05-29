#! /bin/bash
# Usage: add the following line to your ~/.bashrc
# source ~/src/newhive/newduke/bin/git_grep_nd.sh

source $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/git_grep.sh

filter_broken="${filter_broken}|history/history|/jquery-1|/old|/broken|/curl|google_closure.js|/d3/|codemirror.js|jquery-ui|/jquery/|/codemirror/"

alias a="git_grep"
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

# rerun last list 
alias on=rerun_results
# rerun last list, but only accept matches in last file part
alias oe=filepart_results
# rerun last list, filtered through grep
alias og=grep_results

alias routes='n newhive/routes.json'
alias config='e `ff /config.py$`'
