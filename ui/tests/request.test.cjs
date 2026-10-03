const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, context) {
 const output=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const sandbox={exports:{},Error,TypeError,...context};vm.runInNewContext(output,sandbox);return sandbox.exports;
}
function request(fetch, timers={setTimeout,clearTimeout}) {return load('request.ts',{fetch,AbortController,...timers}).requestJSON;}
test('HTML proxy errors are actionable without exposing response HTML',async()=>{
 await assert.rejects(request(async()=>({status:502,ok:false,text:async()=>'<html>upstream secret</html>'}))('/config'),error=>/HTTP 502/.test(error.message)&&!error.message.includes('secret'));
});
test('authentication errors preserve the server message',async()=>{
 await assert.rejects(request(async()=>({status:401,ok:false,text:async()=>' {"message":"用户名或密码错误"}'}))('/login'),/用户名或密码错误/);
});
test('network failure is readable',async()=>{
 await assert.rejects(request(async()=>{throw new TypeError('Failed to fetch');})('/config'),/检查网络/);
});
test('timeout aborts request and clears timer',async()=>{
 let timeout,cleared=false;
 const run=request(async(_,options)=>{timeout();assert.equal(options.signal.aborted,true);throw new Error('aborted');},{setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{cleared=true;}});
 await assert.rejects(run('/config'),/请求超时/);assert.equal(cleared,true);
});
test('logout accepts empty successful response, config does not',async()=>{
 const run=request(async()=>({status:200,ok:true,text:async()=>''}));
 assert.equal(await run('/logout',{},true),undefined);await assert.rejects(run('/config'),/空响应/);
});
test('initial configuration failure ends loading and can retry',async()=>{
 const states=[];let fail=true;
 const React={useRef:current=>({current}),useState:value=>{const state={value};states.push(state);return [value,next=>{state.value=typeof next==='function'?next(state.value):next;}];},useCallback:fn=>fn,useEffect(){}};
 const imports={react:React,notistack:{useSnackbar:()=>({enqueueSnackbar(){}})},'./message':{},'./url':{urlWithSlash:'/'},'./i18n':{i18n:{}},'./request':{requestJSON:async()=>{if(fail)throw new Error('network failure');return {loggedIn:false,user:'guest',createLoginRequired:true};}}};
 const {useConfig}=load('useConfig.ts',{require:id=>imports[id]});const hook=useConfig();
 await hook.refetch();assert.equal(states[1].value.loading,false);assert.equal(states[0].value,'network failure');
 fail=false;await hook.refetch();assert.equal(states[0].value,undefined);assert.equal(states[1].value.user,'guest');
});
