const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const sourceRows = [
  {details:'樂桃大阪五日\n$ 11700 出發日：2027/4/11\n去程｜MM024 桃園09:40-關西13:10\n回程｜MM027 關西15:25-桃園17:55'},
  {details:'樂桃大阪五日\n$ 11300 出發日：2027/1/12\n去程｜MM024 桃園09:40-關西13:10\n回程｜MM027 關西15:25-桃園17:55'}
];
const mainScript = ['domain','data','app'].map(n=>fs.readFileSync(path.join(__dirname,'assets',n+'.js'),'utf8')).join('\n');
const nativeDate = Date;
function harness(instant = '2026-11-25T12:00:00+08:00', flights = sourceRows, tours = []) {
  class Clock extends nativeDate { constructor(...a) { super(...(a.length?a:[instant])); } static now(){return +new nativeDate(instant);} }
  const elements = new Map();
  const get = id => {if(!elements.has(id)) elements.set(id,{innerHTML:'',value:'',insertAdjacentHTML(where,html){this.innerHTML=html+this.innerHTML;},querySelectorAll(){return [];},querySelector(){return null;},classList:{toggle(){},contains(){return false;}}}); return elements.get(id);};
  const listeners = {};
  const dataFor = rows => ({status:'ok',table:{cols:Array.from({length:6},()=>({label:''})),rows:rows.map(r=>({c:[null,null,null,null,null,{v:r.details}]}))}});
  const context = vm.createContext({Date:Clock,Intl,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval(){},console,
    location:{search:'',pathname:'/'}, history:{pushState(a,b,url){const u=new URL(url,'https://www.eddietour.tw');context.location.pathname=u.pathname;context.location.search=u.search;},replaceState(a,b,url){this.pushState(a,b,url);}},
    localStorage:{getItem(){return null;},setItem(){}},
    document:{body:{style:{}},activeElement:null,querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},getElementById:get},
    addEventListener(name,fn){listeners[name]=fn;}, scrollTo(){},
    fetch:async url => ({ok:true,text:async()=>JSON.stringify(dataFor(new URL(url).searchParams.get('sheet')==='清艙'?flights:new URL(url).searchParams.get('sheet')==='旅行團'?tours:[]))})});
  context.window = context;
  vm.runInContext(mainScript,context);
  return {context,get,listeners,run:s=>vm.runInContext(s,context),state:()=>vm.runInContext('state',context)};
}
const simple = (title,flight='MM024',back='MM027',date='2027/1/12',price='11300',origin='桃園') => `${title}\n$ ${price} 出發日：${date}\n去程｜${flight} ${origin}09:40-關西13:10\n回程｜${back} 關西15:25-${origin}17:55`;
module.exports={harness,simple,sourceRows};
