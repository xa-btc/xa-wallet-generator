export function zonePosition(scope){return scope==='any'?'any':scope.startsWith('first')?'front':['ends','both','joined'].includes(scope)?'split':'last';}
export function endScope(position,length){return position==='front'?`first${length}`:length===6?'suffix':`last${length}`;}
export const zoneControlsMarkup=`<div class="zone-positions" role="group" aria-label="Search position"><button type="button" data-zone="front">Front</button><button type="button" data-zone="last">Last</button><button type="button" data-zone="any">Anywhere</button><button type="button" data-zone="split">Split ends</button></div><div class="zone-length-row"><label id="zoneLengthLabel" for="zoneLength">CHARACTERS</label><select id="zoneLength">${[2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${n===6?'selected':''}>${n} characters</option>`).join('')}</select><select id="splitZone" aria-label="Split-end matching" hidden><option value="ends">First 4 + last 4 · either</option><option value="both">First 4 + last 4 · both</option><option value="joined">First 4 + last 4 · one 8-letter word</option></select></div><small id="zoneHint" class="zone-hint"></small>`;
export function installZoneControls(root,onChange){
  const get=id=>root.querySelector('#'+id),scope=get('scope'),length=get('zoneLength'),minimum=get('minLength');
  const buttons=[...root.querySelectorAll('[data-zone]')];
  function sync(){
    const position=zonePosition(scope.value),any=position==='any',split=position==='split';
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.zone===position)));
    if(position==='front'||position==='last')length.value=scope.value==='suffix'?'6':scope.value.replace(/\D/g,'');
    if(any)length.value=minimum.value;
    for(const option of length.options){option.hidden=!any&&+option.value<4;option.textContent=`${option.value}${any?'+':''} characters`;}
    length.hidden=split;get('splitZone').hidden=!split;
    if(split)get('splitZone').value=scope.value;
    get('zoneLengthLabel').textContent=any?'MIN. WORD LENGTH':split?'SPLIT MODE':'CHARACTERS';
    get('zoneLengthLabel').htmlFor=split?'splitZone':'zoneLength';
    get('zoneHint').textContent=any?'Whole address · word matches at least this long':split?'Each end uses 4 characters':`${position==='front'?'First':'Last'} ${length.value} address characters`;
  }
  buttons.forEach(button=>button.onclick=()=>{
    const position=button.dataset.zone;
    scope.value=position==='any'?'any':position==='split'?get('splitZone').value:endScope(position,Math.max(4,+length.value));
    if(position==='any')minimum.value=length.value;
    sync();onChange();
  });
  length.onchange=()=>{
    const position=zonePosition(scope.value);
    if(position==='any')minimum.value=length.value;else scope.value=endScope(position,+length.value);
    sync();onChange();
  };
  get('splitZone').onchange=()=>{scope.value=get('splitZone').value;sync();onChange();};
  return sync;
}
