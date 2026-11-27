'use strict';
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
$('.menu-toggle').addEventListener('click',()=>{const button=$('.menu-toggle'),expanded=button.getAttribute('aria-expanded')==='true';button.setAttribute('aria-expanded',String(!expanded));button.setAttribute('aria-label',expanded?'Open navigation':'Close navigation');button.textContent=expanded?'☰':'✕';$('#mobile-nav').hidden=expanded;});
$$('#mobile-nav a').forEach(link=>link.addEventListener('click',()=>{$('#mobile-nav').hidden=true;$('.menu-toggle').setAttribute('aria-expanded','false');$('.menu-toggle').setAttribute('aria-label','Open navigation');$('.menu-toggle').textContent='☰';}));
$('#copyright-year').textContent=new Date().getFullYear();
