<!doctype html><html><meta charset="utf-8"><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;overflow:hidden;font-family:"Microsoft YaHei","Segoe UI",sans-serif;
background:radial-gradient(1200px 700px at 80% -10%, #D6412F 0%, #B3242B 45%, #8E1B22 100%);color:#FFF6E8;
display:flex;flex-direction:column;padding:56px 64px 48px}
.top{display:flex;justify-content:space-between;align-items:center}
.hl{display:flex;align-items:center;gap:20px}
.logo{width:88px;height:88px;border-radius:22px;display:block}
.brand{font-size:30px;letter-spacing:6px;color:#FFD79A;font-weight:700;line-height:1.35}
.code{font-size:34px;font-weight:800;color:#8E1B22;background:#FFC94D;border-radius:14px;padding:8px 24px;letter-spacing:2px}
.h1{font-size:90px;font-weight:900;line-height:1.06;margin-top:26px;letter-spacing:-1px}
.tag{font-size:40px;color:#FFD79A;margin-top:12px;font-weight:600}
.price{margin-top:26px;display:flex;align-items:flex-end;gap:16px}
.num{font-size:162px;font-weight:900;line-height:0.92;letter-spacing:-4px}
.cur{font-size:40px;font-weight:700;color:#FFC94D;padding-bottom:16px}
.sub{font-size:40px;margin-top:10px;color:#FFE9C8}
.sub b{color:#FFC94D}
.box{margin-top:26px;background:rgba(255,246,232,0.97);border-radius:26px;padding:38px 44px 30px;color:#24120F;
flex:1;display:flex;flex-direction:column}
.box ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;column-gap:30px;row-gap:34px;flex:1;align-content:center;font-size:46px}
.box li{font-size:inherit;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.box li b{color:#B3242B;font-weight:800}
.box.small ul{align-content:start;padding-top:16px}
.box.big ul{grid-template-columns:1fr;row-gap:9px;flex:1;align-content:center;padding-bottom:6px}
.box.big li{white-space:normal;overflow:visible}
.cl{display:flex;align-items:baseline;gap:14px}
.cl b{font-size:37px;color:#24120F}
.cl span{font-size:27px;color:#B3242B;font-weight:800}
.cs{font-size:23px;color:#7A5A50;margin-top:1px;line-height:1.25;letter-spacing:0.3px}
.stats{margin-top:auto;padding-top:18px;border-top:2px dashed rgba(180,36,43,0.35);display:flex;align-items:flex-end}
.st{flex:1;text-align:center}
.st .k{font-size:60px;font-weight:900;color:#B3242B;line-height:1.05}
.st .l{font-size:26px;color:#8A6A60;margin-top:2px;letter-spacing:2px}
.foot{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-end}
.ship{background:#FFC94D;color:#7A1A12;font-size:36px;font-weight:900;padding:10px 30px;border-radius:999px;letter-spacing:2px}
.meta{font-size:30px;color:#FFD79A;text-align:right;line-height:1.5;margin-left:auto}
</style></head><body>
<div class="top"><div class="hl"><img class="logo" src="{{LOGO}}"><div class="brand">欧囤囤<br>OTUNLINK</div></div><div class="code">{{CODE}}</div></div>
<div class="h1">{{NAME}}</div>
<div class="tag">{{TAG}}</div>
<div class="price"><span class="num">{{PRICE}}</span><span class="cur">HUF</span></div>
<div class="sub">单买 <b>{{ORIG}}</b> &nbsp;·&nbsp; 省 <b>{{SAVE}}</b></div>
<div class="box {{BOXMODE}}">
  <ul {{BOXSTYLE}}>{{ITEMS}}</ul>
  <div class="stats">
    <div class="st"><div class="k">{{N}}</div><div class="l">件</div></div>
    <div class="st"><div class="k">{{NS}}</div><div class="l">种</div></div>
    <div class="st"><div class="k">{{AVG}}</div><div class="l">单件 HUF</div></div>
  </div>
</div>
<div class="foot">{{SHIP}}
  <div class="meta">{{KG}} kg · 11.09 – 11.15<br>每包限量，售完不补</div>
</div>
</body></html>
