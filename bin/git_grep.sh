#! /bin/bash
# Usage: add the following line to your ~/.bashrc
# source ~/src/newhive/newduke/bin/git_grep.sh

filter_broken="/old/|/broken/|/curl/|google_closure.js|/d3/|codemirror.js|jquery-ui|/jquery/"
function open_file {
    (which e > /dev/null) && e $* || $EDITOR $*
}
# TODO: comment me
function git_grep {(
    path_match=""
    while true; do
        case "$1" in
            -c) case=true;shift;;
            -o) open=true;shift;;
            -n) search_name=true;shift;;
            -f) force=true;shift;;
            -i) filter_broken="";shift;;
            # -a) all=true;shift;;
            -p) shift; path_match=$1; shift;;
            *) break 2;
        esac
    done

    case_flag='-i'
    if [ $case ]; then case_flag=''; fi

    if [ $search_name ]; then
        git ls-files "$path_match" | grep $case_flag $* > ~/.efffiles
        if [ $filter_broken ]; then
            grep -E -v $filter_broken ~/.efffiles > ~/.efffiles_temp
            mv -f ~/.efffiles_temp ~/.efffiles
        fi
        # echo "git ls-files \"$path_match\" | grep $case_flag $* > ~/.efffiles"
    else
        git grep $case_flag -n --no-color $* -- "$path_match" > ~/.efffiles
        if [ $filter_broken ]; then
            grep -E -v $filter_broken ~/.efffiles > ~/.efffiles_temp
            mv -f ~/.efffiles_temp ~/.efffiles
        fi
        # echo "git grep $case_flag -n --no-color $* -- \"$path_match\" > ~/.efffiles"
    fi

    # list (and number) the matches
    effpat=$(echo $@|awk '{print $NF}')
    echo $effpat >> ~/.eff.log
    grep $case_flag --color $effpat -n ~/.efffiles

    if [ $open ] && ( [ $force ] || [ 1 == $(wc -l < ~/.efffiles) ] ); then
        open_nth 1
    fi
)}

# nth filename:lineno: in ~/.efffiles
function matched_file_and_line {(
    line=$1
    if [ -z $line ]; then
        line="1"
    fi
    echo $(sed ${line}'q;d' $HOME/.efffiles | awk '{print $1}'|sed 's/\(:[0-9]\+:\).*/\1/')
)}
# print the nth filename
function matched_file {(
    echo $(matched_file_and_line $1 | sed 's/:[0-9]\+://')
)}
# open nth file in ~/.efffiles
function open_nth {(
    open_file `matched_file_and_line $1`
)}

