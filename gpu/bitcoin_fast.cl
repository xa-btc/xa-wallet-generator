// secp256k1 fixed-base multiplication and native SegWit addresses.
// Field elements are canonical little-endian 32-bit limbs, p = 2^256-2^32-977.
typedef struct { uint v[8]; } bf;
typedef struct { bf x,y,z; } bp;
inline bf bf_zero(){bf r;for(int i=0;i<8;i++)r.v[i]=0;return r;}
inline bf bf_one(){bf r=bf_zero();r.v[0]=1;return r;}
inline int bf_iszero(bf a){uint r=0;for(int i=0;i<8;i++)r|=a.v[i];return r==0;}
inline bf bf_normalize(bf a){
  int ge=1;for(int i=7;i>=0;i--){uint p=i==0?0xfffffc2fU:i==1?0xfffffffeU:0xffffffffU;if(a.v[i]!=p){ge=a.v[i]>p;break;}}
  if(ge){ulong borrow=0;for(int i=0;i<8;i++){ulong p=(ulong)(i==0?0xfffffc2fU:i==1?0xfffffffeU:0xffffffffU)+borrow;uint old=a.v[i];a.v[i]=old-p;borrow=(ulong)old<p;}}
  return a;
}
inline bf bf_reduce(private uint *w){
  ulong t[10];for(int i=0;i<10;i++)t[i]=i<8?w[i]:0;
  for(int i=0;i<8;i++){t[i]+=(ulong)w[i+8]*977;t[i+1]+=w[i+8];}
  for(int i=0;i<9;i++){t[i+1]+=t[i]>>32;t[i]&=0xffffffffUL;}
  while(t[8]||t[9]){ulong a=t[8],b=t[9];t[8]=t[9]=0;t[0]+=a*977;t[1]+=a+b*977;t[2]+=b;for(int i=0;i<9;i++){t[i+1]+=t[i]>>32;t[i]&=0xffffffffUL;}}
  bf r;for(int i=0;i<8;i++)r.v[i]=(uint)t[i];return bf_normalize(r);
}
inline bf bf_add(bf a,bf b){uint w[16]={0};ulong c=0;for(int i=0;i<8;i++){c+=(ulong)a.v[i]+b.v[i];w[i]=(uint)c;c>>=32;}w[8]=(uint)c;return bf_reduce(w);}
inline bf bf_sub(bf a,bf b){
  bf r;ulong borrow=0;for(int i=0;i<8;i++){ulong sub=(ulong)b.v[i]+borrow;r.v[i]=a.v[i]-sub;borrow=(ulong)a.v[i]<sub;}
  if(borrow){ulong c=0;for(int i=0;i<8;i++){c+=(ulong)r.v[i]+(i==0?0xfffffc2fU:i==1?0xfffffffeU:0xffffffffU);r.v[i]=(uint)c;c>>=32;}}
  return r;
}
inline bf bf_mul(bf a,bf b){
  uint w[16]={0};
  #pragma unroll
  for(int i=0;i<8;i++){ulong c=0;
    #pragma unroll
    for(int j=0;j<8;j++){ulong t=(ulong)a.v[i]*b.v[j]+w[i+j]+c;w[i+j]=(uint)t;c=t>>32;}
    w[i+8]=(uint)c;
  }
  return bf_reduce(w);
}
inline bf bf_sq(bf a){return bf_mul(a,a);}
inline bf bf_twice(bf a){return bf_add(a,a);}
inline bf bf_inv(bf a){bf r=bf_one();for(int bit=255;bit>=0;bit--){r=bf_sq(r);uint limb=bit<32?0xfffffc2dU:bit<64?0xfffffffeU:0xffffffffU;if((limb>>(bit&31))&1)r=bf_mul(r,a);}return r;}
inline bp bp_double(bp a){
  bf yy=bf_sq(a.y),s=bf_twice(bf_twice(bf_mul(a.x,yy))),m=bf_sq(a.x);m=bf_add(m,bf_twice(m));
  bp r;r.x=bf_sub(bf_sq(m),bf_twice(s));r.y=bf_sub(bf_mul(m,bf_sub(s,r.x)),bf_twice(bf_twice(bf_twice(bf_sq(yy)))));r.z=bf_twice(bf_mul(a.y,a.z));return r;
}
inline bp bp_add(bp a,bf x,bf y){
  if(bf_iszero(a.z)){a.x=x;a.y=y;a.z=bf_one();return a;}
  bf zz=bf_sq(a.z),h=bf_sub(bf_mul(x,zz),a.x),r=bf_sub(bf_mul(y,bf_mul(zz,a.z)),a.y);
  if(bf_iszero(h)){if(bf_iszero(r))return bp_double(a);a.z=bf_zero();return a;}
  bf hh=bf_sq(h),hhh=bf_mul(h,hh),v=bf_mul(a.x,hh);
  bp out;out.x=bf_sub(bf_sub(bf_sq(r),hhh),bf_twice(v));out.y=bf_sub(bf_mul(r,bf_sub(v,out.x)),bf_mul(a.y,hhh));out.z=bf_mul(a.z,h);return out;
}
// One random key per candidate; the public table contains no secret material.
kernel void btc_fast_points(global const uchar *keys,global const uint *table,global uint *points){
  uint id=get_global_id(0);bp p;p.z=bf_zero();p.x=p.y=bf_zero();
  for(uint pos=0;pos<32;pos++){uint digit=keys[id*32+31-pos];if(!digit)continue;uint offset=(pos*255+digit-1)*16;bf x,y;for(int j=0;j<8;j++){x.v[j]=table[offset+j];y.v[j]=table[offset+8+j];}p=bp_add(p,x,y);}
  for(int j=0;j<8;j++){points[id*24+j]=p.x.v[j];points[id*24+8+j]=p.y.v[j];points[id*24+16+j]=p.z.v[j];}
}
// Montgomery batch inversion amortizes one field inversion over 64 independent keys.
// Each lane has its own random key; batching does not create related private keys.
kernel void btc_fast_inverse(global const uint *points,global uint *inverses,uint size){
  uint start=get_global_id(0)*64;bf prefix[64],acc=bf_one();
  for(uint i=0;i<64&&start+i<size;i++){bf z;for(int j=0;j<8;j++)z.v[j]=points[(start+i)*24+16+j];prefix[i]=acc;if(!bf_iszero(z))acc=bf_mul(acc,z);}
  acc=bf_inv(acc);
  for(int i=min((uint)64,size-start)-1;i>=0;i--){bf z;for(int j=0;j<8;j++)z.v[j]=points[(start+i)*24+16+j];bf inv=bf_zero();if(!bf_iszero(z)){inv=bf_mul(acc,prefix[i]);acc=bf_mul(acc,z);}for(int j=0;j<8;j++)inverses[(start+i)*8+j]=inv.v[j];}
}
constant uint BF_SHA_K[64]={
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2};
inline uint bf_rotr(uint a,uint n){return rotate(a,32-n);}
inline uint bf_swap(uint a){return ((a&255)<<24)|((a&0xff00)<<8)|((a>>8)&0xff00)|(a>>24);}
inline void bf_sha(private uchar *pub,private uint *out){
  uint w[16]={0};for(int i=0;i<33;i++)w[i/4]|=(uint)pub[i]<<(24-8*(i%4));w[8]|=0x800000;w[15]=264;
  uint a=0x6a09e667,b=0xbb67ae85,c=0x3c6ef372,d=0xa54ff53a,e=0x510e527f,f=0x9b05688c,g=0x1f83d9ab,h=0x5be0cd19;
  for(int i=0;i<64;i++){if(i>=16){uint x=w[(i-15)&15],y=w[(i-2)&15];w[i&15]+=(bf_rotr(x,7)^bf_rotr(x,18)^(x>>3))+w[(i-7)&15]+(bf_rotr(y,17)^bf_rotr(y,19)^(y>>10));}uint t=h+(bf_rotr(e,6)^bf_rotr(e,11)^bf_rotr(e,25))+((e&f)^(~e&g))+BF_SHA_K[i]+w[i&15];uint u=(bf_rotr(a,2)^bf_rotr(a,13)^bf_rotr(a,22))+((a&b)^(a&c)^(b&c));h=g;g=f;f=e;e=d+t;d=c;c=b;b=a;a=t+u;}
  out[0]=bf_swap(a+0x6a09e667);out[1]=bf_swap(b+0xbb67ae85);out[2]=bf_swap(c+0x3c6ef372);out[3]=bf_swap(d+0xa54ff53a);out[4]=bf_swap(e+0x510e527f);out[5]=bf_swap(f+0x9b05688c);out[6]=bf_swap(g+0x1f83d9ab);out[7]=bf_swap(h+0x5be0cd19);
}
constant uchar BF_R[80]={0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13};
constant uchar BF_RR[80]={5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11};
constant uchar BF_S[80]={11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6};
constant uchar BF_SS[80]={8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11};
constant uint BF_K[5]={0,0x5a827999,0x6ed9eba1,0x8f1bbcdc,0xa953fd4e};
constant uint BF_KK[5]={0x50a28be6,0x5c4dd124,0x6d703ef3,0x7a6d76e9,0};
inline uint bf_f(int round,uint b,uint c,uint d){if(round==0)return b^c^d;if(round==1)return (b&c)|(~b&d);if(round==2)return (b|~c)^d;if(round==3)return (b&d)|(c&~d);return b^(c|~d);}
inline void bf_ripemd(private uint *w,private uchar *out){
  w[8]=0x80;for(int i=9;i<16;i++)w[i]=0;w[14]=256;
  uint a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476,e=0xc3d2e1f0,aa=a,bb=b,cc=c,dd=d,ee=e;
  for(int i=0;i<80;i++){int r=i/16;uint t=rotate(a+bf_f(r,b,c,d)+w[BF_R[i]]+BF_K[r],(uint)BF_S[i])+e;a=e;e=d;d=rotate(c,10U);c=b;b=t;t=rotate(aa+bf_f(4-r,bb,cc,dd)+w[BF_RR[i]]+BF_KK[r],(uint)BF_SS[i])+ee;aa=ee;ee=dd;dd=rotate(cc,10U);cc=bb;bb=t;}
  uint h[5]={0xefcdab89U+c+dd,0x98badcfeU+d+ee,0x10325476U+e+aa,0xc3d2e1f0U+a+bb,0x67452301U+b+cc};for(int i=0;i<20;i++)out[i]=(uchar)(h[i/4]>>(8*(i%4)));
}
constant char BF_BECH[]="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
constant uint BF_GEN[5]={0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3};
inline uint bf_poly(uint chk,uint value){uint top=chk>>25;chk=((chk&0x1ffffff)<<5)^value;for(int j=0;j<5;j++)if((top>>j)&1)chk^=BF_GEN[j];return chk;}
kernel void btc_fast_addresses(global const uint *points,global const uint *inverses,global uchar *addresses){
  uint id=get_global_id(0);bf x,y,z;for(int j=0;j<8;j++){x.v[j]=points[id*24+j];y.v[j]=points[id*24+8+j];z.v[j]=inverses[id*8+j];}
  bf zz=bf_sq(z);x=bf_mul(x,zz);y=bf_mul(y,bf_mul(zz,z));uchar pub[33];pub[0]=2+(y.v[0]&1);for(int i=0;i<32;i++)pub[i+1]=(uchar)(x.v[7-i/4]>>(24-8*(i%4)));
  uint w[16];uchar hash[20];bf_sha(pub,w);bf_ripemd(w,hash);
  uint chk=1;chk=bf_poly(chk,3);chk=bf_poly(chk,3);chk=bf_poly(chk,0);chk=bf_poly(chk,2);chk=bf_poly(chk,3);chk=bf_poly(chk,0);
  uint acc=0,bits=0,offset=0;for(int i=0;i<20;i++){acc=(acc<<8)|hash[i];bits+=8;while(bits>=5){bits-=5;uint v=(acc>>bits)&31;addresses[id*38+offset++]=BF_BECH[v];chk=bf_poly(chk,v);}}
  for(int i=0;i<6;i++)chk=bf_poly(chk,0);chk^=1;for(int i=0;i<6;i++)addresses[id*38+32+i]=BF_BECH[(chk>>(5*(5-i)))&31];
}
