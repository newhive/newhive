#! /bin/bash
# Usage: add the following line to your ~/.bashrc
# source ~/src/newhive/newduke/bin/shell_helpers.sh

# figure out where we are, using $NEWHIVE_HOME as override:
if [ -n "$NEWHIVE_HOME" ]; then : ;
elif [ -L ${BASH_SOURCE[0]} ]; then
    NEWHIVE_HOME=$( dirname $( readlink -f ${BASH_SOURCE[0]} ) )/..
else 
    NEWHIVE_HOME=$( dirname "${BASH_SOURCE[0]}" )/..
fi

### BEGIN find_files in git repo helpers ###
############################################
source $NEWHIVE_HOME/bin/git_grep.sh

filter_broken="${filter_broken}|/titanium/|history/history|/jquery-1|/old|/broken|/curl|google_closure.js|/d3/|codemirror.js|jquery-ui|/jquery/jquery|/codemirror/|mobile/[pt]|mobile/app/[^w]|zepto-|jquery.js"

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
### END   find_files in git repo helpers ###
############################################

# git root dir
alias groot='git rev-parse --show-toplevel'
alias cdg='cd $(groot)' # top level of current repo
alias cdnh='cd $NEWHIVE_HOME' # go to default repo from outside 
alias cdnhp='cd /var/www/newhive' # go to default production home

alias ff='find|grep -i'

alias routes='e $(groot)/newhive/routes.json'
alias config='e $(groot)/newhive/config/config.py'
alias config_common='e $(groot)/newhive/config/config_common.py'

# server management
function psk(){
   if pgrep -f $1; then
       pgrep -f $1 | xargs kill;
   else
       return 1;
   fi
} 
function newhive() {(
  cdg
  ./server.py $*
)}

alias killserver='psk server.py'
alias rrr='reset; cdg; killserver; newhive'
alias pylog='sudo less +F /var/log/apache2/error.log'

# production mode
alias pylog='less +F /var/log/apache2/error.log'

# shell shortcuts
alias his='history'
alias wwhich='echo $PATH|tr : " "|xargs find|grep -i'
alias ..='cd ../'
alias ...='cd ../../'
alias ....='cd ../../../'
alias .....='cd ../../../../'
alias ers='e ~/.bashrc'
alias rs='source ~/.bashrc'

# basic linux utils
alias m='less -R'
alias xx='chmod 755'
alias xr='chmod 644'
alias open='xdg-open'
alias gi='grep -i'

### BEGIN git_stuff ###
#######################
alias g='git'
# git root dir
# pre-submit checks
alias pre="st;git diff|grep -n 'print\|!!\|bugbug\|TODO'"
alias bm='git checkout master'
alias bnd='git checkout newduke'
alias bstage='git checkout staging'
alias gC='git commit'
alias st='git status'
alias gpp='git pull && (cd `groot`;git submodule update) && git push'
# alias gbranch='git status|grep branch|awk '"'"'{print $4}'"'"
# alias gmerge='~/bin/gitmerge.sh master `gbranch`'

git_branch() {
    b=$(git symbolic-ref HEAD 2> /dev/null);
    if [ $b ]; then echo -n "${b##refs/heads/}"; fi
}

# git binary search.  check out the a commit $1 commits back from HEAD
function ghis {(
    branch=$2
    if [ -z $branch ]; then
        branch="master"
    fi
    git checkout $branch > /dev/null 2>&1
    git log --pretty=oneline|head -$1|tail -1|awk '{print $1}'
)}
function gbin {
    git checkout `ghis $*`
}

# git log, print the last $1 commits, 1 line per commit
function glog {
    lines=$1
    if [ -z $lines ]; then
        lines="20"
    fi
    git log --pretty=oneline|head -$lines
}
### END   git_stuff ###
#######################
