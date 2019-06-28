#! /bin/bash

# find NewHive
NEWHIVE_HOME=/home/newhive
if [ ! -d $NEWHIVE_HOME ]; then NEWHIVE_HOME=$HOME/newhive; fi 

# aliases
alias nh=nhrepl #TODO make a cooler top level utility?
alias nhcd='cd $NEWHIVE_HOME'

alias nhRoutes='e $(groot)/newhive/routes.json'
alias nhconfig='e $(groot)/newhive/config/config.py'
alias nhconfigcommon='e $(groot)/newhive/config/config_common.py'

alias nhrepl='nhcd; ipython -i bin/server_examples.py'
alias nhkilldev='psk server.py'
alias nhRESETdev='nhcd; nhkilldev; nhstartdev'
alias nhlogproduction='less +F /var/log/apache2/error.log'
alias nhShellHelpers='e `groot`/bin/shell_helpers.sh'
alias nhadmin='ssh -i .ssh/google_compute_engine admin.newhive.com'


## BEGIN git_grep
alias gr="git_grep -o"
alias grh="git_grep -o -p '*.html'"
alias grs="git_grep -o -p '*.scss'"
alias grp="git_grep -o -p '*.py'"
alias grj="git_grep -o -p '*.js'"
alias grpd="grep_python_def"
alias gn="git_grep -o -n"
alias gnh="git_grep -o -p '*.html' -n"
alias gns="git_grep -o -p '*.scss' -n"
alias gnp="git_grep -o -p '*.py' -n"
alias gnj="git_grep -o -p '*.js' -n"

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
## END git_grep


# server_management
function psk(){
   if pgrep -f $1; then
       pgrep -f $1 | xargs kill;
   else
       return 1;
   fi
} 
function nhstartdev() {(
  cd $NEWHIVE_HOME
  ./server.py $*
)}

# shell shortcuts
alias ..='cd ../'
alias ...='cd ../../'
alias ....='cd ../../../'
alias .....='cd ../../../../'
alias ff='find|grep -i'

# basic linux utils
#alias m='less -R'
#alias xx='chmod 755'
#alias xr='chmod 644'
#alias open='xdg-open'
#alias gi='grep -i'
#alias t='type'

# diagnostics
alias ping8='ping 8.8.8.8'
alias myip="ifconfig | grep inet.addr | grep -v 127.0.0.1 | awk -F: '{print $2}' | awk '{print $1}'"
alias mygate="route -n | grep ^0.0.0.0 | awk '{print $2}'"
alias pinggate='ping `mygate`'


## BEGIN git_stuff
alias g='git'
# git root dir
# pre-submit checks
alias gpre="st;git diff|grep -n 'print\|!!\|bugbug\|TODO'"
alias gm='git checkout master'
alias gstage='git checkout staging'
alias gc='git commit'
alias gs='git status'
alias gpp='git pull && (cd `groot`;git submodule update) && git push'
alias gcd='cd $(groot)' # top level of current repo
# alias gbranch='git status|grep branch|awk '"'"'{print $4}'"'"
# alias gmerge='~/bin/gitmerge.sh master `gbranch`'

# get completion
. $NEWHIVE_HOME/bin/git-completion.bash
__git_complete g __git_main

# git root dir
function groot() {(
  gitroot=`git rev-parse --show-toplevel 2> /dev/null`
  if [ -z $gitroot ]; then
    echo $NEWHIVE_HOME
  else
    echo $gitroot
  fi;
)}

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
## END git_stuff
