// XA Wallet Generator OpenCL entry points. The Ed25519 implementation is supplied by
// the GPL-3.0 SolVanityCL source in vendor/; see THIRD_PARTY.md.
constant char WF_ALPHABET[] = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
inline uchar wf_lower(uchar c) { return c >= 'A' && c <= 'Z' ? c + 32 : c; }
inline ulong wf_bit(uchar c) {
  c = wf_lower(c);
  if (c >= '0' && c <= '9') return 1UL << (c - '0');
  if (c >= 'a' && c <= 'z') return 1UL << (c - 'a' + 10);
  return 0;
}
inline ulong wf_mask(uchar c, int leet) {
  ulong mask = wf_bit(c);
  if (!leet) return mask;
  switch (c) {
    case '0': return mask | wf_bit('o');
    case '1': return mask | wf_bit('i') | wf_bit('l');
    case '2': return mask | wf_bit('z');
    case '3': return mask | wf_bit('e');
    case '4': return mask | wf_bit('a');
    case '5': return mask | wf_bit('s');
    case '6': case '9': return mask | wf_bit('g');
    case '7': return mask | wf_bit('t');
    case '8': return mask | wf_bit('b');
  }
  return mask;
}

inline int wf_matches(private uchar *addr, uint n,
  global const ulong *word_masks, global const uint *word_offsets, global const uint *word_lengths,
  global const uint *bucket_offsets, global const uint *bucket_ids, global const uint *word_scores,
  global const ulong *prefix, global const ulong *suffix,
  uint prefix_length, uint suffix_length, int scope, int leet, int only_matches, int min_rank, int required_repeat, int ignore_repeated) {
  ulong masks[45];
  for(uint i=0;i<n;i++) masks[i]=wf_mask(addr[i],leet);
  if(prefix_length>n || suffix_length>n) return 0;
  for(uint i=0;i<prefix_length;i++) if(!(masks[i]&prefix[i])) return 0;
  for(uint i=0;i<suffix_length;i++) if(!(masks[n-suffix_length+i]&suffix[i])) return 0;
  uchar joined[8];
  if(scope==7){
    for(uint i=0;i<4;i++){joined[i]=addr[i];joined[i+4]=addr[n-4+i];}
    addr=joined;n=8;
    for(uint i=0;i<n;i++)masks[i]=wf_mask(addr[i],leet);
  }
  uint starts[2]={0,0}, lengths[2]={(uint)n,0}, zones=1;
  if(scope==0 || scope==6){ starts[1]=n-4;lengths[0]=4;lengths[1]=4;zones=2; }
  else if(scope==1){ starts[0]=n-6;lengths[0]=6; }
  else if(scope==3){ lengths[0]=4; }
  else if(scope==4){ starts[0]=n-4;lengths[0]=4; }
  else if(scope>=8 && scope<=13){ lengths[0]=scope-3; }
  else if(scope>=14 && scope<=17){ lengths[0]=scope-7;starts[0]=n-lengths[0]; }
  else if(scope==5){ starts[0]=n-5;lengths[0]=5; }
  int first_word=-1, multiple=0; uint score_bound=0; uint longest=0, streak=0;
  uint word_zones=0, repeat_zones=0;
  for(uint z=0;z<zones;z++) {
    uint start=starts[z], length=lengths[z], run=1;
    for(uint p=0;p<length;p++) {
      if(p>0 && wf_lower(addr[start+p])==wf_lower(addr[start+p-1]))run++;else run=1;
      if(run>=2)streak=max(streak,run);
      if(run>=3)repeat_zones|=1U<<z;
      if(length-p<2)continue;
      uint key=(uint)wf_lower(addr[start+p])*128+(uint)wf_lower(addr[start+p+1]);
      for(uint k=bucket_offsets[key];k<bucket_offsets[key+1];k++) {
        uint w=bucket_ids[k], len=word_lengths[w];
        if(len>length-p)continue;
        int match=1;
        for(uint j=2;j<len;j++) if(!(masks[start+p+j]&word_masks[word_offsets[w]+j])){match=0;break;}
        if(match){word_zones|=1U<<z;score_bound=max(score_bound,word_scores[w]);longest=max(longest,len);if(first_word>=0 && first_word!=(int)w)multiple=1;first_word=w;}
      }
    }
  }
  if(scope==6){
    uint matched=word_zones;
    if(only_matches!=2){matched|=repeat_zones;if(prefix_length)matched|=1;if(suffix_length)matched|=2;if(prefix_length>n-4)matched|=2;if(suffix_length>n-4)matched|=1;}
    if(matched!=3)return 0;
  }
  // Round upward and allow the maximum multi-pattern bonus. CPU scoring
  // removes false positives; the GPU must never discard a possible qualifier.
  if(streak>=3){
    uint opportunities=0;
    for(uint z=0;z<zones;z++)if(lengths[z]>=streak)opportunities+=lengths[z]-streak+1;
    // Widest alphabet, perfect casing, and all 24 independent-pattern points.
    // The placement penalty applies even to this conservative repeat bound.
    score_bound=max(score_bound,(uint)ceil((float)streak*17.574f-3.0f*log2((float)max((uint)1,opportunities)))+66);
  }
  // Explicit anchors are word matches independently of zone and dictionary.
  // Use the widest alphabet's upper bound; CPU verification applies exact scoring.
  if(prefix_length || suffix_length)score_bound=max(score_bound,(uint)ceil((float)max(prefix_length,suffix_length)*17.574f)+56);
  const uint thresholds[7]={0,45,60,75,90,105,120};
  if((only_matches==2 || scope==7) && first_word<0)return 0;
  // ignore_repeated is the inclusive cutoff: 0=off, 7=main search, 44=strict overflow.
  if((ignore_repeated && streak>=(ignore_repeated==7?2:3) && streak<=ignore_repeated) || streak<required_repeat || (!prefix_length && !suffix_length && score_bound<thresholds[min_rank]) || (only_matches && !prefix_length && !suffix_length && first_word<0 && streak<3))return 0;
  return 1;
}
