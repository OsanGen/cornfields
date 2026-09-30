/** One URL chooses the controls from the device's primary input capabilities. */
export function selectControlMode({search='',coarse=false,fine=false,maxTouchPoints=0}={}) {
  const parameters=new URLSearchParams(search);
  const override=parameters.get('controls');
  // Old shared links must not force phone controls onto a computer (or vice versa).
  if(parameters.get('test')==='1'&&['touch','mouse'].includes(override))return override;
  return maxTouchPoints>0&&coarse&&!fine?'touch':'mouse';
}
