__kernel void wf_public_keys(global const uchar *seeds, global uchar *pubs) {
  const uint id = get_global_id(0);
  uchar seed[32], pub[32] __attribute__((aligned(4))), secret[64];
  for (uint i=0;i<32;i++) seed[i]=seeds[id*32+i];
  ed25519_create_keypair(pub, secret, seed);
  for (uint i=0;i<32;i++) pubs[id*32+i]=pub[i];
}
__kernel void wf_search(
  global const uchar *seeds, global uint *count, global uint *indices, global uchar *pubs,
  global const ulong *word_masks, global const uint *word_offsets, global const uint *word_lengths,
  global const uint *bucket_offsets, global const uint *bucket_ids, global const uint *word_scores,
  global const ulong *prefix, global const ulong *suffix,
  uint prefix_length, uint suffix_length, int scope, int leet, int only_matches, int min_rank, int required_repeat, int ignore_repeated,
  global uchar *candidate_pubs, int reuse_keys
) {
  const uint id=get_global_id(0);
  uchar seed[32], pub[32] __attribute__((aligned(4))), secret[64];
  for (uint i=0;i<32;i++) seed[i]=seeds[id*32+i];
  if(reuse_keys) { for(uint i=0;i<32;i++) pub[i]=candidate_pubs[id*32+i]; }
  else { ed25519_create_keypair(pub,secret,seed); for(uint i=0;i<32;i++) candidate_pubs[id*32+i]=pub[i]; }
  size_t n; uchar encoded[45] __attribute__((aligned(4)));
  uchar *digits=base58_encode(pub,&n,encoded);
  uchar addr[45];
  for(uint i=0;i<n;i++) { addr[i]=WF_ALPHABET[digits[i]]; }
  if(!wf_matches(addr,n,word_masks,word_offsets,word_lengths,bucket_offsets,bucket_ids,word_scores,
      prefix,suffix,prefix_length,suffix_length,scope,leet,only_matches,min_rank,required_repeat,ignore_repeated)) return;
  uint slot=atomic_inc(count);
  indices[slot]=id;
  for(uint i=0;i<32;i++)pubs[slot*32+i]=pub[i];
}
