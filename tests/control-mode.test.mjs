import test from 'node:test';
import assert from 'node:assert/strict';
import {selectControlMode} from '../src/control-mode.js';

const desktop={fine:true,coarse:false,maxTouchPoints:0};
const phone={fine:false,coarse:true,maxTouchPoints:5};
for(const [name,device,search,expected] of [
  ['desktop',desktop,'','mouse'],
  ['phone or tablet',phone,'','touch'],
  ['touch laptop with a mouse',{...desktop,maxTouchPoints:10},'','mouse'],
  ['old mobile link opened on desktop',desktop,'?controls=touch&release=1d11415','mouse'],
  ['old desktop link opened on phone',phone,'?controls=mouse','touch'],
  ['coarse pointer without a touchscreen',{...phone,maxTouchPoints:0},'','mouse'],
  ['fine primary pointer takes priority',{...phone,fine:true},'','mouse'],
  ['explicit touch test override',desktop,'?test=1&controls=touch','touch'],
  ['explicit mouse test override',phone,'?test=1&controls=mouse','mouse'],
  ['disabled test flag cannot force touch',desktop,'?test=0&controls=touch','mouse'],
  ['unknown test mode uses device',phone,'?test=1&controls=unknown','touch'],
])test(`control detection: ${name}`,()=>assert.equal(selectControlMode({...device,search}),expected));
