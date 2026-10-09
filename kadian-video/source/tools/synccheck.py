import numpy as np, subprocess, json, sys
vid = sys.argv[1]; tl = json.load(open(sys.argv[2])); T = tl["T"]; t0 = tl["t0"]
w, h = 192, 108
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", vid, "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
fps = float(eval(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", vid]).decode().strip()))
d = np.abs(np.diff(fr, axis=0)).mean((1, 2))           # change between frame i and i+1 -> event at frame i+1
times = (np.arange(1, len(fr))) / fps
# strong cuts: big jumps relative to local median
med = np.convolve(d, np.ones(31) / 31, "same")
ev = np.where((d > 12) & (d > 3 * med))[0]
offs = []
for i in ev:
    t = times[i]; k = round((t - t0) / T); offs.append((t - (t0 + k * T)) * 1000)
offs = np.array(offs)
print("frames", len(fr), "fps", fps, "detected cuts", len(ev))
print("offset from nearest beat (ms): median %.1f  mean %.1f  p10 %.1f  p90 %.1f" % (np.median(offs), offs.mean(), np.percentile(offs, 10), np.percentile(offs, 90)))
print("within ±17ms (1 frame):", np.mean(np.abs(offs) <= 17.0).round(3))
bad = [(round(times[i], 2), round(o, 1)) for i, o in zip(ev, offs) if abs(o) > 17]
print("off-grid cuts (t, ms):", bad[:40])
