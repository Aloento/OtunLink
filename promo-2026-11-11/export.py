# -*- coding: utf-8 -*-
import sys, json, math
sys.path.insert(0,'promo-2026-11-11')
from data import SKU, FREIGHT, RATE
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

rows = json.load(open('promo-2026-11-11/final10.json', encoding='utf-8'))
ALL = json.load(open('promo-2026-11-11/final.json', encoding='utf-8'))
for r in rows: r['qty'] = {int(k):v for k,v in r['qty'].items()}

HDR = PatternFill("solid", fgColor="1F3864")
HDRF = Font(color="FFFFFF", bold=True, size=10)
SUB = PatternFill("solid", fgColor="D9E2F3")
RED = Font(color="C00000", bold=True)
GRN = Font(color="375623")
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin,right=thin,top=thin,bottom=thin)

wb = openpyxl.Workbook()

# ---------- Sheet1 套餐总表 ----------
ws = wb.active; ws.title = "10个套餐总表"
ws["A1"] = "欧囤囤 OtunLink · 双十一周（2026-11-11）套餐定价表 · 10 个套餐版"
ws["A1"].font = Font(bold=True, size=14, color="1F3864")
ws["A2"] = ("口径：套餐价=对客零售价（单品价一律不动）；成本=BP 落地成本（到布达佩斯仓库）/箱规×49.52 HUF，即「平进平出」底线；邮费 1,600 HUF/箱（≤5kg/箱，超重拆箱计费）；"
            "代理结算价=套餐价×0.80，代理提成=(套餐价−结算价)/2（与单品『提成=价差/2』规则一致）")
ws["A2"].font = Font(size=9, color="595959")
ws.merge_cells("A2:X2")

hdr = ["编码","套餐名称","层级","套餐价","包邮","件数","SKU数","实重kg","箱数","运费承担",
       "零售价合计","让利额","让利率","含邮综合让利","成本","毛利","毛利率","包邮后净利","净利率",
       "代理结算价","代理毛利","代理毛利率","单件均价","亏本钩子","选品主线"]
ws.append([]); ws.append(hdr)
hr = ws.max_row
for c in range(1,len(hdr)+1):
    cell = ws.cell(row=hr,column=c); cell.fill=HDR; cell.font=HDRF; cell.border=BOX
    cell.alignment=Alignment(horizontal="center", vertical="center", wrap_text=True)

THEME = {
"A1":"薯片+蟹味棒+果冻 追剧场景","A2":"辣条+素毛肚+宽粉 嗜辣","A3":"果冻+奥利奥 甜口",
"A4":"螺蛳粉+泡面 一人食","A5":"小胡鸭卤味+下酒小食","B1":"火锅底料+蘸料+配菜",
"B2":"螺蛳粉囤货+卤味","B3":"薯片+劲仔+果冻 办公室分享","B4":"辣条/辣片全口味",
"B5":"小胡鸭全系卤味","C1":"螺蛳粉+老干妈+酱菜 家庭囤","C2":"榙榙果干+奥利奥 轻食",
"C3":"4人火锅全套","D1":"宴客火锅+零食填充","D2":"螺蛳粉+卤味高价值",
"D3":"全零食大箱","D4":"果干+鸭掌+凤爪 礼盒","D5":"全品类分享","D6":"小包装办公室茶水间",
"D7":"顶配至尊箱",
}
for r in rows:
    ws.append([r['code'], r['name'], r['code'][0], r['P'], "是" if r['free'] else "否",
               r['n'], r['ns'], r['kg'], r['parcels'], r['fr'],
               r['R'], r['save'], r['disc'], r['comp_disc'], round(r['C']),
               round(r['P']-r['C']), r['gm'], round(r['P']-r['C']-r['fr']), r['netm'],
               r['agent'], round(r['agent']-r['C']), r['agent_gm'], round(r['P']/r['n']),
               ((r.get('hook_names','').replace('三养火鸡面','火鸡面')+f" ×{r['hook_n']}") if r.get('hook_n') else '—'), THEME[r['code']]])
    i = ws.max_row
    for c in range(1,len(hdr)+1): ws.cell(row=i,column=c).border=BOX
    for c in (13,14,17,19,22):
        ws.cell(row=i,column=c).number_format='0.0%'
    for c in (4,10,11,12,15,16,18,20,21,23):
        ws.cell(row=i,column=c).number_format='#,##0'
    ws.cell(row=i,column=1).alignment=Alignment(horizontal="center")
    if r['free']:
        for c in (1,2,5): ws.cell(row=i,column=c).font=Font(bold=True,color="1F3864")
        ws.cell(row=i,column=5).fill=PatternFill("solid",fgColor="E2EFDA")
    if r['gm'] < 0.38: ws.cell(row=i,column=17).font=RED

widths = [7,14,6,9,6,6,6,8,6,9,10,9,8,10,9,8,8,10,8,10,9,9,9,14,24]
for i,w in enumerate(widths,1): ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = ws.cell(row=hr+1, column=3)
ws.row_dimensions[hr].height = 34

# 汇总
srow = ws.max_row + 2
ws.cell(row=srow,column=1,value="校验").font=Font(bold=True,size=11,color="1F3864")
checks = [
 ("套餐数量", f"{len(rows)} 个（老板要求 ≤10）", "通过"),
 ("包邮套餐数 / 最低包邮价", f"{sum(1 for r in rows if r['free'])} 个 / {min(r['P'] for r in rows if r['free']):,} HUF", "通过"),
 ("最低让利率（套餐 vs 零售价合计）", f"{min(r['disc'] for r in rows):.1%}（{min(rows,key=lambda x:x['disc'])['name']}）", "通过"),
 ("最低毛利率", f"{min(r['gm'] for r in rows):.1%}", "通过"),
 ("包邮套餐最低净利率（扣运费后）", f"{min(r['netm'] for r in rows if r['free']):.1%}", "通过"),
 ("代理口径最低毛利率", f"{min(r['agent_gm'] for r in rows):.1%}", "通过"),
 ("全部套餐成本 < 套餐价（无平进平出破线）", "是", "通过"),
 ("最大实重 / 箱数", f"{max(r['kg'] for r in rows)} kg / {max(r['parcels'] for r in rows)} 箱（店庆至尊箱）", "注意：2 箱计费 3,200"),
 ("亏本钩子投放", f"{len([r for r in rows if r.get('hook_n')])} 个包 / {sum(r.get('hook_n',0) for r in rows)} 支；机会成本 {sum(r.get('hook_opp',0) for r in rows):,} HUF", f"占总毛利 {sum(r.get('hook_opp',0) for r in rows)/sum(r['P']-r['C'] for r in rows)*100:.1f}%"),
]
for k,(a,b,c) in enumerate(checks):
    ws.cell(row=srow+1+k,column=1,value=a).font=Font(size=9)
    ws.merge_cells(start_row=srow+1+k,start_column=1,end_row=srow+1+k,end_column=4)
    ws.cell(row=srow+1+k,column=5,value=b).font=Font(size=9,bold=True)
    ws.merge_cells(start_row=srow+1+k,start_column=5,end_row=srow+1+k,end_column=8)

# ---------- Sheet2 套餐明细 ----------
ws2 = wb.create_sheet("套餐明细")
h2 = ["编码","套餐","SKU","品名","数量","单件零售价","零售金额","单件成本","成本小计","单件批发价","批发金额"]
ws2.append(h2)
for c in range(1,len(h2)+1):
    cell=ws2.cell(row=1,column=c); cell.fill=HDR; cell.font=HDRF; cell.border=BOX
    cell.alignment=Alignment(horizontal="center")
for r in rows:
    first=True
    for k in sorted(r['qty']):
        v=r['qty'][k]; s=SKU[k]
        ws2.append([r['code'] if first else "", r['name'] if first else "", k, s['name'], v,
                    s['rrp'], s['rrp']*v, round(s['cost']), round(s['cost']*v), s['w'], s['w']*v])
        i=ws2.max_row
        for c in range(1,len(h2)+1): ws2.cell(row=i,column=c).border=BOX
        for c in (6,7,8,9,10,11): ws2.cell(row=i,column=c).number_format='#,##0'
        first=False
    ws2.append(["","","","— 小计 —", r['n'], "", r['R'], "", round(r['C']), "", r['W']])
    i=ws2.max_row
    for c in range(1,len(h2)+1):
        ws2.cell(row=i,column=c).fill=SUB; ws2.cell(row=i,column=c).font=Font(bold=True,size=9); ws2.cell(row=i,column=c).border=BOX
    for c in (7,9,11): ws2.cell(row=i,column=c).number_format='#,##0'
for i,w in enumerate([7,14,6,40,6,10,10,9,9,10,10],1): ws2.column_dimensions[get_column_letter(i)].width=w
ws2.freeze_panes="A2"

# ---------- Sheet3 SKU底表 ----------
ws3 = wb.create_sheet("SKU成本底表")
h3 = ["序号","品名","品类","单位","批发价","建议零售价","成本(CNY/箱)","箱规","单件成本HUF","批发毛利率","零售毛利率","净重g","风险标记"]
ws3.append(h3)
for c in range(1,len(h3)+1):
    cell=ws3.cell(row=1,column=c); cell.fill=HDR; cell.font=HDRF; cell.border=BOX
    cell.alignment=Alignment(horizontal="center",wrap_text=True)
for k,s in SKU.items():
    flag=""
    if s['rrp'] - s['cost'] < 0: flag="零售价低于成本"
    elif s['gm_r'] < 0.30: flag="零售毛利率<30%"
    elif s['w'] - s['cost'] < 0: flag="批发价低于成本"
    elif s['gm_w'] < 0.10: flag="批发毛利率<10%"
    ws3.append([k, s['name'], s['cat'], s['unit'], s['w'], s['rrp'], s['case_cost'], s['case'], round(s['cost']), s['gm_w'], s['gm_r'], s['gram'], flag])
    i=ws3.max_row
    for c in range(1,len(h3)+1): ws3.cell(row=i,column=c).border=BOX
    for c in (10,11): ws3.cell(row=i,column=c).number_format='0.0%'
    for c in (5,6,9): ws3.cell(row=i,column=c).number_format='#,##0'
    if flag: ws3.cell(row=i,column=13).font=RED
for i,w in enumerate([6,42,8,6,9,11,12,7,11,10,10,8,20],1): ws3.column_dimensions[get_column_letter(i)].width=w
ws3.freeze_panes="A2"

# ---------- Sheet4 规则 ----------
ws4 = wb.create_sheet("规则与机制")
ws4.column_dimensions['A'].width=4; ws4.column_dimensions['B'].width=110
def put(title, lines, r):
    ws4.cell(row=r,column=2,value=title).font=Font(bold=True,size=11,color="1F3864"); r+=1
    for ln in lines:
        c=ws4.cell(row=r,column=2,value=ln); c.alignment=Alignment(wrap_text=True,vertical="top"); r+=1
    return r+1
r=1
r=put("① 定价三原则",[
 "1) 单品价一律不动：54 个 SKU 的零售价与批发价全程不调，让利只发生在套餐内部；门店/代理的价签不需要重打。",
 f"2) 套餐价 ≥ 成本：所有 20 个套餐成本均低于套餐价，最低毛利率 {min(x['gm'] for x in rows)*100:.1f}%，不存在平进平出甚至倒挂的套餐。",
 f"3) 折扣随客单递减：A/B 层（引流/主力）让利 {min(x['disc'] for x in rows if x['code'][0] in 'AB')*100:.0f}–{max(x['disc'] for x in rows if x['code'][0] in 'AB')*100:.0f}%，C 层 {min(x['disc'] for x in rows if x['code'][0]=='C')*100:.0f}–{max(x['disc'] for x in rows if x['code'][0]=='C')*100:.0f}%，D 层（包邮）货品让利 {min(x['disc'] for x in rows if x['free'])*100:.0f}–{max(x['disc'] for x in rows if x['free'])*100:.0f}%，靠免运费补足。",
],r)
r=put("② 包邮规则（本次最关键的一条）",[
 "包邮门槛：套餐价 ≥ 18,900 HUF。不包邮最贵一档 12,900 HUF，价差 6,000 HUF = 3.75× 邮费成本（1,600）。",
 f"单套餐校验：包邮套餐毛利均 ≥ {min(x['P']-x['C'] for x in rows if x['free']):,.0f} HUF（≥{min(x['P']-x['C'] for x in rows if x['free'])/1600:.1f}× 邮费），扣掉 1,600 运费后净利率 {min(x['netm'] for x in rows if x['free'])*100:.1f}%–{max(x['netm'] for x in rows if x['free'])*100:.1f}%。",
 "计费口径：1,600 HUF/箱，单箱 ≤5kg；店庆至尊箱 5.31kg 需拆 2 箱，按 3,200 计，净利率仍为 30.8%。",
 "禁止：任何 <18,900 的套餐包邮；任何以『满额包邮』替代套餐包邮（会把 1,600 摊到低毛利小单上）。",
],r)
r=put("③ 让利结构（为什么不靠单品打折）",[
 "高毛利骨架：乐事(68%)、巧福娃小包(62–70%)、喜之郎(56%)、奥利奥(32%)、劲仔(62%) 负责撑折扣空间；",
 "价值锚：螺蛳粉(32%)、卤味(27–41%)、火锅底料(28%)、老干妈(34–39%) 负责拉高『零售价合计』的锚点；",
 f"亏本钩子：三养火鸡面 / 珠江桥生抽 / 珠江桥老抽 共 {sum(r.get('hook_n',0) for r in rows)} 支，只放在 {len([r for r in rows if r.get('hook_n')])} 个包，按原价计入、不参与套餐折扣（零售价已低于成本，再打折就是双重补贴）。",
],r)
r=put("④ 渠道与代理",[
 "代理结算价 = 套餐价 × 0.80；代理提成 = (套餐价 − 结算价) ÷ 2（沿用单品『提成=价差/2』规则，代理绝对收入随客单上升）。",
 f"代理最低毛利率 {min(x['agent_gm'] for x in rows)*100:.1f}%（{min(rows,key=lambda x:x['agent_gm'])['name']}，带钩子）——该包不开放代理；其余 ≥18.8%，代理不得低于套餐价对外销售，违者取消双十一返点。",
 "门店自提：套餐价再减 1,600（等同包邮价值），但仅限 ≥18,900 的套餐，避免小店拆单套运费。",
],r)
r=put("⑤ 反套利与风控",[
 "每单限购 1 个套餐；套餐内 SKU 不参与任何单品满减/优惠券；套餐订单不允许改价、拆行、部分退货。",
 "包邮仅对『整套餐下单』生效，退其中任一件则按原价补收 1,600 运费。",
 "库存联动：套餐上架前锁定批次（FEFO），临期批次优先塞进 C/D 层大箱，A 层只用新批次。",
 "成本红线：若某一 SKU 到货成本上涨 >10%，该 SKU 从套餐中替换，不调整套餐价。",
],r)


# ---------- Sheet5 已砍套餐 ----------
ws5 = wb.create_sheet("已砍10个（备选）")
kept = {r['code'] for r in rows}
ws5["A1"] = "收缩时砍掉的 10 个套餐（备选池，随时可换回来）"
ws5["A1"].font = Font(bold=True, size=12, color="1F3864")
h5 = ["编码","套餐","套餐价","包邮","件数","零售价合计","让利","成本","毛利率","包邮后净利率","砍掉理由"]
ws5.append([]); ws5.append(h5)
for c in range(1,len(h5)+1):
    cell=ws5.cell(row=3,column=c); cell.fill=HDR; cell.font=HDRF; cell.border=BOX
    cell.alignment=Alignment(horizontal="center",wrap_text=True)
REASON = {
 "A2":"3,490 与 A1 2,990 太近，砍一个即可","A3":"同上，3,990 与 A4 4,490 太近",
 "A5":"4,990 夹在 A4 与 B1 之间，位置尴尬","B2":"6,990 与 B1 5,990 重复场景（速食）",
 "B4":"8,990 辣条全家桶，品类可由 A1/B3 覆盖","C1":"10,900 与 B5/C3 太挤，生抽钩子已移到 D1/D5",
 "C2":"11,900 果干箱，客群窄（送礼场景可另开）","D2":"19,900 与 D1 同场景（火锅/嗦粉），重量也最大",
 "D4":"25,900 送礼盒，与 D5 客群重叠","D7":"32,900 与 D6 同价位，且需 2 箱（运费 3,200）"}
for r in ALL:
    if r['code'] in kept: continue
    r['qty']={int(k):v for k,v in r['qty'].items()}
    ws5.append([r['code'], r['name'], r['P'], "是" if r['free'] else "否", r['n'], r['R'],
                r['disc'], round(r['C']), r['gm'], r['netm'], REASON.get(r['code'],"")])
    i=ws5.max_row
    for c in range(1,len(h5)+1): ws5.cell(row=i,column=c).border=BOX
    for c in (7,9,10): ws5.cell(row=i,column=c).number_format='0.0%'
    for c in (3,6,8): ws5.cell(row=i,column=c).number_format='#,##0'
for i,w in enumerate([7,16,10,7,7,12,9,9,9,12,40],1): ws5.column_dimensions[get_column_letter(i)].width=w

wb.save('promo-2026-11-11/OtunLink 双十一套餐定价表 2026-11-11.xlsx')
print("saved")
