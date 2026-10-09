import numpy as np, soundfile as sf, json, sys
from PIL import Image, ImageDraw, ImageFont
x, sr = sf.read(sys.argv[1]); x = x.mean(1)
tl = json.load(open(sys.argv[2])); T=tl["T"]; t0=tl["t0"]
W=3000; H=300; img=Image.new("RGB",(W,H+60),(0,0,0)); d=ImageDraw.Draw(img)
n=len(x); step=n//W
for i in range(W):
    seg=x[i*step:(i+1)*step]; r=np.sqrt(np.mean(seg**2)); p=np.abs(seg).max()
    d.line([(i,H/2-p*H/2),(i,H/2+p*H/2)],fill=(60,90,140)); d.line([(i,H/2-r*H/2*1.4),(i,H/2+r*H/2*1.4)],fill=(120,200,255))
f=ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",14)
for nl in tl["narr"]:
    a=nl["words"][0]["t"]/ (n/sr)*W; e=nl["end"]/(n/sr)*W
    d.rectangle([a,H+5,e,H+15],fill=(255,140,60)); d.text((a,H+18),nl["id"],fill=(255,200,150),font=f)
for s in tl["scenes"]:
    x0=(t0+s["b0"]*T)/(n/sr)*W; d.line([(x0,0),(x0,H)],fill=(255,255,255)); d.text((x0+2,2),s["name"],fill=(255,255,255),font=f)
img.save(sys.argv[3])
