#! /bin/bash


header="Take a break, fool!  "
messages="Neck stretch;Back twist;Leg stretch"
IFS=';' read -a messages <<< "$messages"
# echo $ergo_count
# export ergo_count=$(( (ergo_count + 1) % ${#messages[@]} ))
# echo $ergo_count
notify-send -t 100000 -a ergo -u critical "$header${messages[$ergo_count]}"
