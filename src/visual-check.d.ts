export type CaptureScene={id:string;label:string;preRollFrames?:number;prepare:()=>void|Promise<void>;render:(dt:number,frame:number)=>void};
export type CaptureAdapter={quality:string;seed:number;scenes:CaptureScene[];assets:()=>{status:'ready'|'fallback';items:{name:string;status:'ready'|'fallback'}[]};renderInfo:()=>{calls:number;triangles:number;quality:string};restore:()=>void|Promise<void>};
export function installVisualCheck(options:{game:string;release:string;canvas:HTMLCanvasElement;available:()=>boolean;begin:(context:{signal:AbortSignal;status:(text:string)=>void})=>Promise<CaptureAdapter>}):{refresh:()=>void;dispose:()=>void};

export function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>;
