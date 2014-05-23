#! /bin/bash
# Usage: add the following line to your ~/.bashrc
# source ~/src/newhive/newduke/bin/git_grep_nd.sh

source $( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/git_grep.sh

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
# Search python definition
function ad {(
    grepvar=$1
    shift
    a -o -p "*.py" $* "def[^(]*$grepvar"
)}

alias o='open_nth'
alias o1='o 1'
alias o2='o 2'
alias o3='o 3'
alias o4='o 4'
alias o4='o 5'
# rerun last list 
alias on='grep . ~/.efffiles | grep -n -i `tail -1 ~/.eff.log`'
# rerun last list, but only accept matches in last file part
alias oe='grep . ~/.efffiles | grep -n -i `tail -1 ~/.eff.log`[^/]*$'

alias routes='n newhive/routes.json'
alias config='e `ff /config.py$`'
