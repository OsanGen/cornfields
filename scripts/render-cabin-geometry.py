# Offline software rasterization of shipped mesh triangles and actual skinned
# vertices. This is a geometry diagnostic, not a browser/WebGL lighting test.
import json, sys, math
import numpy as np
from PIL import Image, ImageDraw
mode=sys.argv[1] if len(sys.argv)>1 else 'after'
data=json.load(open('output/scene-alignment/'+mode+'-geometry.json'))
w,h=1100,720; focal=h/(2*math.tan(math.radians(65)/2));eye=np.array(data['eye']);target=np.array(data['target'])
f=(target-eye);f/=np.linalg.norm(f);right=np.cross(f,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,f);basis=np.array([right,up,f])
canvas=np.zeros((h,w,3),np.uint8)+np.array([30,40,44],np.uint8);zbuffer=np.ones((h,w))*np.inf
light=np.array([.3,.8,.5]);light/=np.linalg.norm(light)
for mesh in data['meshes']:
    points=np.array(mesh['points']).reshape(-1,3);cp=(points-eye)@basis.T;indices=np.array(mesh['index']).reshape(-1,3)
    for idx in indices:
        vertices=cp[idx]; world=points[idx]
        if np.max(vertices[:,2])<.035:continue
        # Clip the near plane before projection, preserving triangles that pass
        # beside the close passenger eye rather than dropping their whole mesh.
        poly=[]
        for k in range(3):
            a,b=vertices[k-1],vertices[k];ai=a[2]>=.035;bi=b[2]>=.035
            if ai!=bi:poly.append(a+(b-a)*(.035-a[2])/(b[2]-a[2]))
            if bi:poly.append(b)
        if len(poly)<3:continue
        n=np.cross(world[1]-world[0],world[2]-world[0]);norm=np.linalg.norm(n)
        if norm<1e-12:continue
        n/=norm;shade=.36+.64*abs(np.dot(n,light));rgb=np.clip(np.array(mesh['color'])*255*shade,0,255)
        for j in range(1,len(poly)-1):
            v=np.array([poly[0],poly[j],poly[j+1]]);p=np.column_stack((w/2+v[:,0]*focal/v[:,2],h/2-v[:,1]*focal/v[:,2]))
            xmin=max(0,int(np.floor(p[:,0].min())));xmax=min(w-1,int(np.ceil(p[:,0].max())));ymin=max(0,int(np.floor(p[:,1].min())));ymax=min(h-1,int(np.ceil(p[:,1].max())))
            if xmin>xmax or ymin>ymax:continue
            x,y=np.meshgrid(np.arange(xmin,xmax+1)+.5,np.arange(ymin,ymax+1)+.5)
            a,b,c=p;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-9:continue
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;v2=1-u-v1
            inside=(u>=0)&(v1>=0)&(v2>=0);inv=u/v[0,2]+v1/v[1,2]+v2/v[2,2];depth=np.divide(1,inv,out=np.ones_like(inv)*np.inf,where=inv>0)
            z=zbuffer[ymin:ymax+1,xmin:xmax+1];keep=inside&(depth<z);z[keep]=depth[keep];canvas[ymin:ymax+1,xmin:xmax+1][keep]=rgb
im=Image.fromarray(canvas);draw=ImageDraw.Draw(im);draw.rectangle((0,0,w,52),fill=(8,15,18));draw.text((18,12),f'{mode.upper()} | OFFLINE GEOMETRY DIAGNOSTIC | Actual cruiser + skinned cast, passenger eye',fill=(245,245,225));draw.text((18,31),'No textures, browser lighting, fog or GPU shaders. Not visual QA.',fill=(195,210,210));im.save('output/scene-alignment/'+mode+'-cabin-geometry.png')
