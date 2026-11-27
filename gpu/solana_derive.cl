// SLIP-0010 Ed25519, Phantom m/44'/501'/0'/0'. Uses bitcoin.cl SHA-512.
inline void sol_hmac(private const uchar *key,uint keylen,private const uchar *msg,uint len,private uchar *out){
  ulong ipad[8],opad[8],block[16],state[8];
  btc_init(ipad);btc_init(opad);
  for(uint i=0;i<16;i++){
    ulong value=0;
    for(uint j=0;j<8;j++){uint at=i*8+j;value=(value<<8)|(at<keylen?key[at]:0);}
    block[i]=value^0x3636363636363636UL;
  }
  btc_compress(ipad,block);
  for(uint i=0;i<16;i++){
    ulong value=0;
    for(uint j=0;j<8;j++){uint at=i*8+j;value=(value<<8)|(at<keylen?key[at]:0);}
    block[i]=value^0x5c5c5c5c5c5c5c5cUL;
  }
  btc_compress(opad,block);
  for(uint i=0;i<16;i++)block[i]=0;
  for(uint i=0;i<len;i++)block[i/8]|=((ulong)msg[i])<<(56-(i%8)*8);
  block[len/8]|=((ulong)0x80)<<(56-(len%8)*8);block[15]=(128+len)*8;
  for(uint i=0;i<8;i++)state[i]=ipad[i];btc_compress(state,block);
  for(uint i=0;i<8;i++){block[i]=state[i];state[i]=opad[i];}
  for(uint i=8;i<16;i++)block[i]=0;block[8]=0x8000000000000000UL;block[15]=1536;
  btc_compress(state,block);
  for(uint i=0;i<64;i++)out[i]=(uchar)(state[i/8]>>(56-(i%8)*8));
}
__kernel void sol_derive(global const uchar *seeds,global uchar *keys){
  uint id=get_global_id(0);
  uchar master[12]={'e','d','2','5','5','1','9',' ','s','e','e','d'};
  uchar seed[64],digest[64],chain[32],message[37];
  for(uint i=0;i<64;i++)seed[i]=seeds[id*64+i];
  sol_hmac(master,12,seed,64,digest);
  for(uint depth=0;depth<4;depth++){
    for(uint i=0;i<32;i++){chain[i]=digest[32+i];message[1+i]=digest[i];}
    uint index=0x80000000U+(depth==0?44:depth==1?501:0);
    message[0]=0;for(uint i=0;i<4;i++)message[33+i]=(uchar)(index>>(24-i*8));
    sol_hmac(chain,32,message,37,digest);
  }
  for(uint i=0;i<32;i++)keys[id*32+i]=digest[i];
}
