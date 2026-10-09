#!/bin/bash
# sheet.sh video out.png t1 t2 ... (3 columns, 640x360)
V=$1; O=$2; shift 2; D=$(mktemp -d); i=0; args=(); filt=""
for t in "$@"; do ffmpeg -v error -y -ss $t -i "$V" -frames:v 1 -vf scale=640:360 $D/f$i.png; args+=(-i $D/f$i.png); filt+="[$i:v]drawtext=text='$t':x=8:y=8:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6[v$i];"; i=$((i+1)); done
lay=""; for ((k=0;k<i;k++)); do lay+="$(( (k%3)*640 ))_$(( (k/3)*360 ))|"; done; lay=${lay%|}
ins=""; for ((k=0;k<i;k++)); do ins+="[v$k]"; done
ffmpeg -v error -y "${args[@]}" -filter_complex "${filt}${ins}xstack=inputs=$i:layout=$lay:fill=black[o]" -map "[o]" $O
