// BIP39 PBKDF2-HMAC-SHA512 for 12-word ASCII English phrases, empty passphrase.
// FIPS 180-4 round constants cross-checked against @noble/hashes (MIT).
constant ulong BTC_K[80]={
  0x428a2f98d728ae22UL,0x7137449123ef65cdUL,0xb5c0fbcfec4d3b2fUL,0xe9b5dba58189dbbcUL,
  0x3956c25bf348b538UL,0x59f111f1b605d019UL,0x923f82a4af194f9bUL,0xab1c5ed5da6d8118UL,
  0xd807aa98a3030242UL,0x12835b0145706fbeUL,0x243185be4ee4b28cUL,0x550c7dc3d5ffb4e2UL,
  0x72be5d74f27b896fUL,0x80deb1fe3b1696b1UL,0x9bdc06a725c71235UL,0xc19bf174cf692694UL,
  0xe49b69c19ef14ad2UL,0xefbe4786384f25e3UL,0x0fc19dc68b8cd5b5UL,0x240ca1cc77ac9c65UL,
  0x2de92c6f592b0275UL,0x4a7484aa6ea6e483UL,0x5cb0a9dcbd41fbd4UL,0x76f988da831153b5UL,
  0x983e5152ee66dfabUL,0xa831c66d2db43210UL,0xb00327c898fb213fUL,0xbf597fc7beef0ee4UL,
  0xc6e00bf33da88fc2UL,0xd5a79147930aa725UL,0x06ca6351e003826fUL,0x142929670a0e6e70UL,
  0x27b70a8546d22ffcUL,0x2e1b21385c26c926UL,0x4d2c6dfc5ac42aedUL,0x53380d139d95b3dfUL,
  0x650a73548baf63deUL,0x766a0abb3c77b2a8UL,0x81c2c92e47edaee6UL,0x92722c851482353bUL,
  0xa2bfe8a14cf10364UL,0xa81a664bbc423001UL,0xc24b8b70d0f89791UL,0xc76c51a30654be30UL,
  0xd192e819d6ef5218UL,0xd69906245565a910UL,0xf40e35855771202aUL,0x106aa07032bbd1b8UL,
  0x19a4c116b8d2d0c8UL,0x1e376c085141ab53UL,0x2748774cdf8eeb99UL,0x34b0bcb5e19b48a8UL,
  0x391c0cb3c5c95a63UL,0x4ed8aa4ae3418acbUL,0x5b9cca4f7763e373UL,0x682e6ff3d6b2b8a3UL,
  0x748f82ee5defb2fcUL,0x78a5636f43172f60UL,0x84c87814a1f0ab72UL,0x8cc702081a6439ecUL,
  0x90befffa23631e28UL,0xa4506cebde82bde9UL,0xbef9a3f7b2c67915UL,0xc67178f2e372532bUL,
  0xca273eceea26619cUL,0xd186b8c721c0c207UL,0xeada7dd6cde0eb1eUL,0xf57d4f7fee6ed178UL,
  0x06f067aa72176fbaUL,0x0a637dc5a2c898a6UL,0x113f9804bef90daeUL,0x1b710b35131c471bUL,
  0x28db77f523047d84UL,0x32caab7b40c72493UL,0x3c9ebe0a15c9bebcUL,0x431d67c49c100d4cUL,
  0x4cc5d4becb3e42b6UL,0x597f299cfc657e2aUL,0x5fcb6fab3ad6faecUL,0x6c44198c4a475817UL
};

inline ulong btc_rotr(ulong x,uint n){return (x>>n)|(x<<(64-n));}
inline void btc_init(private ulong *s){
  s[0]=0x6a09e667f3bcc908UL;s[1]=0xbb67ae8584caa73bUL;s[2]=0x3c6ef372fe94f82bUL;s[3]=0xa54ff53a5f1d36f1UL;
  s[4]=0x510e527fade682d1UL;s[5]=0x9b05688c2b3e6c1fUL;s[6]=0x1f83d9abfb41bd6bUL;s[7]=0x5be0cd19137e2179UL;
}
inline void btc_compress(private ulong *s,private ulong *w){
  ulong a=s[0],b=s[1],c=s[2],d=s[3],e=s[4],f=s[5],g=s[6],h=s[7];
  // Constant round indexes let the compiler keep the rolling schedule in registers.
  #pragma unroll 80
  for(uint i=0;i<80;i++){
    if(i>=16){ulong x=w[(i-15)&15],y=w[(i-2)&15];
      w[i&15]+=(btc_rotr(x,1)^btc_rotr(x,8)^(x>>7))+w[(i-7)&15]+(btc_rotr(y,19)^btc_rotr(y,61)^(y>>6));}
    ulong t1=h+(btc_rotr(e,14)^btc_rotr(e,18)^btc_rotr(e,41))+((e&f)^((~e)&g))+BTC_K[i]+w[i&15];
    ulong t2=(btc_rotr(a,28)^btc_rotr(a,34)^btc_rotr(a,39))+((a&b)^(a&c)^(b&c));
    h=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
  }
  s[0]+=a;s[1]+=b;s[2]+=c;s[3]+=d;s[4]+=e;s[5]+=f;s[6]+=g;s[7]+=h;
}
inline void btc_hmac64(private const ulong *ipad,private const ulong *opad,private ulong *message){
  ulong state[8],w[16];
  for(uint i=0;i<8;i++){state[i]=ipad[i];w[i]=message[i];}
  for(uint i=8;i<16;i++)w[i]=0;w[8]=0x8000000000000000UL;w[15]=1536;
  btc_compress(state,w);
  for(uint i=0;i<8;i++){w[i]=state[i];state[i]=opad[i];}
  for(uint i=8;i<16;i++)w[i]=0;w[8]=0x8000000000000000UL;w[15]=1536;
  btc_compress(state,w);for(uint i=0;i<8;i++)message[i]=state[i];
}
__kernel void btc_bip39(global const uchar *phrases,global uchar *seeds){
  uint id=get_global_id(0);ulong ipad[8],opad[8],block[16],u[8],result[8];
  btc_init(ipad);btc_init(opad);
  for(uint i=0;i<16;i++){ulong value=0;for(uint j=0;j<8;j++)value=(value<<8)|phrases[id*128+i*8+j];block[i]=value^0x3636363636363636UL;}
  btc_compress(ipad,block);
  for(uint i=0;i<16;i++){ulong value=0;for(uint j=0;j<8;j++)value=(value<<8)|phrases[id*128+i*8+j];block[i]=value^0x5c5c5c5c5c5c5c5cUL;}
  btc_compress(opad,block);
  // First PBKDF2 block: "mnemonic" || INT32_BE(1), with HMAC's 128-byte prefix.
  for(uint i=0;i<8;i++)u[i]=ipad[i];for(uint i=0;i<16;i++)block[i]=0;
  block[0]=0x6d6e656d6f6e6963UL;block[1]=0x0000000180000000UL;block[15]=1120;
  btc_compress(u,block);
  for(uint i=0;i<8;i++){block[i]=u[i];u[i]=opad[i];}
  for(uint i=8;i<16;i++)block[i]=0;block[8]=0x8000000000000000UL;block[15]=1536;
  btc_compress(u,block);for(uint i=0;i<8;i++)result[i]=u[i];
  for(uint round=1;round<2048;round++){btc_hmac64(ipad,opad,u);for(uint i=0;i<8;i++)result[i]^=u[i];}
  for(uint i=0;i<8;i++)for(uint j=0;j<8;j++)seeds[id*64+i*8+j]=(uchar)(result[i]>>(56-j*8));
}

__kernel void btc_filter(global const uchar *addresses,global uint *count,global uint *indices,
  global const ulong *word_masks,global const uint *word_offsets,global const uint *word_lengths,
  global const uint *bucket_offsets,global const uint *bucket_ids,global const uint *word_scores,
  global const ulong *prefix,global const ulong *suffix,
  uint prefix_length,uint suffix_length,int scope,int leet,int only_matches,int min_rank,int required_repeat, int ignore_repeated){
  uint id=get_global_id(0);uchar addr[38];for(uint i=0;i<38;i++)addr[i]=addresses[id*38+i];
  if(!wf_matches(addr,38,word_masks,word_offsets,word_lengths,bucket_offsets,bucket_ids,word_scores,
    prefix,suffix,prefix_length,suffix_length,scope,leet,only_matches,min_rank,required_repeat,ignore_repeated))return;
  uint slot=atomic_inc(count);indices[slot]=id;
}
