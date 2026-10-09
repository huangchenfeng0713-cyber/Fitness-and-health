import librosa, numpy as np, json, sys
from PIL import Image
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
g=json.load(open(sys.argv[2])); T=g["T"]; t0=g["t0"]
hop=512
C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
M = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=20)
R = librosa.feature.rms(y=y, hop_length=hop)[0]
nb = int((len(y)/sr - t0)/(4*T))
feats=[]; rms=[]
for b in range(nb):
    a=int((t0+4*b*T)*sr/hop); e=int((t0+4*(b+1)*T)*sr/hop)
    c=C[:,a:e]; m=M[:,a:e]
    # beat-synchronous chroma (4 beats x 12) + mfcc mean
    cs=[c[:, int(k*(e-a)/4):int((k+1)*(e-a)/4)].mean(1) for k in range(4)]
    f=np.concatenate([np.concatenate(cs)/ (np.linalg.norm(np.concatenate(cs))+1e-9), m[1:].mean(1)/50])
    feats.append(f); rms.append(R[a:e].mean())
F=np.array(feats); F=(F-F.mean(0))/(F.std(0)+1e-9)
F/= np.linalg.norm(F,axis=1,keepdims=True)
Sm=F@F.T
print("nbars",nb)
for b in range(nb):
    best=np.argsort(-Sm[b])[1:4]
    print(f"bar {b:2d} t={t0+4*b*T:6.2f} rms={rms[b]*100:5.1f} similar:{list(best)} {np.round(Sm[b,best],2)}")
img=((Sm+1)/2*255).clip(0,255).astype(np.uint8)
np.save(sys.argv[3].replace(".png",".npy"), Sm); np.save(sys.argv[3].replace(".png","_rms.npy"), np.array(rms))
Image.fromarray(img).resize((nb*12,nb*12),0).save(sys.argv[3])
