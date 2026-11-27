// Ethereum Keccak-256 (legacy 0x01 padding, not SHA3-256).
// Uses the shared secp256k1 points and batch inverses from bitcoin_fast.cl.
constant ulong ETH_RC[24]={
0x0000000000000001UL,0x0000000000008082UL,0x800000000000808aUL,0x8000000080008000UL,
0x000000000000808bUL,0x0000000080000001UL,0x8000000080008081UL,0x8000000000008009UL,
0x000000000000008aUL,0x0000000000000088UL,0x0000000080008009UL,0x000000008000000aUL,
0x000000008000808bUL,0x800000000000008bUL,0x8000000000008089UL,0x8000000000008003UL,
0x8000000000008002UL,0x8000000000000080UL,0x000000000000800aUL,0x800000008000000aUL,
0x8000000080008081UL,0x8000000000008080UL,0x0000000080000001UL,0x8000000080008008UL};
constant uint ETH_ROT[25]={0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14};
inline void eth_keccak(private ulong *s){
  for(uint round=0;round<24;round++){
    ulong c[5],d[5],b[25];
    #pragma unroll
    for(uint x=0;x<5;x++)c[x]=s[x]^s[x+5]^s[x+10]^s[x+15]^s[x+20];
    #pragma unroll
    for(uint x=0;x<5;x++)d[x]=c[(x+4)%5]^rotate(c[(x+1)%5],(ulong)1);
    #pragma unroll
    for(uint y=0;y<5;y++){
      #pragma unroll
      for(uint x=0;x<5;x++)b[y+5*((2*x+3*y)%5)]=rotate(s[x+5*y]^d[x],(ulong)ETH_ROT[x+5*y]);
    }
    #pragma unroll
    for(uint y=0;y<5;y++){
      #pragma unroll
      for(uint x=0;x<5;x++)s[x+5*y]=b[x+5*y]^((~b[(x+1)%5+5*y])&b[(x+2)%5+5*y]);
    }
    s[0]^=ETH_RC[round];
  }
}
constant char ETH_HEX[]="0123456789abcdef";
kernel void eth_fast_addresses(global const uint *points,global const uint *inverses,global uchar *addresses){
  uint id=get_global_id(0);bf x,y,z;
  for(int j=0;j<8;j++){x.v[j]=points[id*24+j];y.v[j]=points[id*24+8+j];z.v[j]=inverses[id*8+j];}
  bf zz=bf_sq(z);x=bf_mul(x,zz);y=bf_mul(y,bf_mul(zz,z));
  // Hash the 64-byte big-endian X || Y, without the uncompressed 0x04 prefix.
  ulong s[25]={0};
  for(uint i=0;i<64;i++){uint j=i%32;uint limb=i<32?x.v[7-j/4]:y.v[7-j/4];uchar byte=(uchar)(limb>>(24-8*(j%4)));s[i/8]|=(ulong)byte<<(8*(i%8));}
  s[8]=1;s[16]=0x8000000000000000UL;eth_keccak(s);
  for(uint i=0;i<20;i++){uint pos=i+12;uchar byte=(uchar)(s[pos/8]>>(8*(pos%8)));addresses[id*40+2*i]=ETH_HEX[byte>>4];addresses[id*40+2*i+1]=ETH_HEX[byte&15];}
}
kernel void eth_filter(global const uchar *addresses,global uint *count,global uint *indices,
  global const ulong *word_masks,global const uint *word_offsets,global const uint *word_lengths,
  global const uint *bucket_offsets,global const uint *bucket_ids,global const uint *word_scores,
  global const ulong *prefix,global const ulong *suffix,
  uint prefix_length,uint suffix_length,int scope,int leet,int only_matches,int min_rank,int required_repeat,int ignore_repeated){
  uint id=get_global_id(0);uchar addr[40];for(uint i=0;i<40;i++)addr[i]=addresses[id*40+i];
  // Conservative case-insensitive matching; JS checks exact EIP-55 casing/styles.
  if(!wf_matches(addr,40,word_masks,word_offsets,word_lengths,bucket_offsets,bucket_ids,word_scores,
    prefix,suffix,prefix_length,suffix_length,scope,leet,only_matches,min_rank,required_repeat,ignore_repeated))return;
  uint slot=atomic_inc(count);indices[slot]=id;
}
