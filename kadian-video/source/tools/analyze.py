import librosa, numpy as np, json, sys
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
dur = len(y)/sr
hop=256
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, tightness=200)
bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
print("dur", dur, "tempo", tempo, "nbeats", len(bt))
ibi = np.diff(bt); print("ibi mean/std", ibi.mean(), ibi.std(), "min/max", ibi.min(), ibi.max())
print("first beats", np.round(bt[:12],3))
# RMS per 0.5 s
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
# bands
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[f<150].sum(0); mid=S[(f>=150)&(f<2000)].sum(0); high=S[f>=4000].sum(0)
step=int(1.0*sr/hop)
print("sec  rms   low   mid   high  onset")
for i in range(0, len(rms), step):
    sl=slice(i,i+step)
    print(f"{t[i]:6.1f} {rms[sl].mean()*100:5.1f} {low[sl].mean():6.1f} {mid[sl].mean():6.1f} {high[sl].mean():6.1f} {oenv[sl].mean():5.2f}")
json.dump({"tempo":float(tempo),"beats":bt.tolist(),"dur":dur}, open(sys.argv[2],"w"))
