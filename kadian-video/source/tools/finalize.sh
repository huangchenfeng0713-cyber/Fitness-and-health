#!/bin/bash
set -e
S=$(cd "$(dirname "$0")/.." && pwd)
OUT=$1; NAME=$2
cd $OUT
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy video_only.mp4
ffmpeg -v error -y -i video_only.mp4 -i $S/audio/final_mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -metadata title="卡点为什么这么爽" "$NAME"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration,start_time,bit_rate -show_entries format=duration,size -of compact "$NAME"
