# -*- coding: utf-8 -*-
import json, os, base64, subprocess, sys
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from data import SKU

rows = json.load(open(os.path.join(BASE,'final10.json'), encoding='utf-8'))
for r in rows: r['qty'] = {int(k):v for k,v in r['qty'].items()}

SHORT = {1:"乐事 波浪薯片",2:"乐事 黄瓜薯片",3:"乐事 烤肉薯片",4:"劲仔 深海小鱼",5:"劲仔 香辣小鱼",
6:"喜之郎 果冻",7:"喜之郎 葡萄果冻",8:"巧福娃 蟹味棒",9:"巧福娃 麻酱蟹味棒",12:"巧福娃 素毛肚",
13:"巧福娃 贡菜",14:"巧福娃 香辣贡菜",15:"巧福娃 豆卷香肠",16:"巧福娃 鹌鹑蛋豆卷",18:"巧福娃 宽粉",
19:"巧福娃 香辣宽粉",23:"三养 火鸡面",24:"好欢螺 螺蛳粉",30:"海底捞 香辣蘸料",31:"海底捞 麻辣蘸料",
32:"海底捞 牛油底料",33:"海底捞 芝麻酱",34:"海底捞 菌汤底料",35:"珠江桥 生抽",36:"珠江桥 老抽",
39:"小胡鸭 蒜香凤爪",40:"小胡鸭 柠檬凤爪",41:"小胡鸭 虎皮凤爪",43:"小胡鸭 鸭翅",44:"小胡鸭 鸭脖",
45:"小胡鸭 鸭锁骨",46:"奥利奥 抹茶",47:"奥利奥 白桃乌龙",49:"榙榙 芒果干",52:"乌江 榨菜",
53:"开口爽 酸豆角",54:"干腐竹"}
CAT = {1:"薯片",2:"薯片",3:"薯片",4:"小鱼",5:"小鱼",6:"果冻",7:"果冻",8:"辣味小包",9:"辣味小包",
12:"辣味小包",13:"辣味小包",14:"辣味小包",15:"辣味小包",16:"辣味小包",18:"辣味小包",19:"辣味小包",
23:"火鸡面",24:"螺蛳粉",30:"火锅料",31:"火锅料",32:"火锅料",33:"火锅料",34:"火锅料",35:"酱油",
36:"酱油",39:"卤味",40:"卤味",41:"卤味",43:"卤味",44:"卤味",45:"卤味",46:"饼干",47:"饼干",
49:"果干",52:"酱菜",53:"酱菜",54:"干货"}
TAG = {"A1":"一箱追完一部剧","A4":"一个人的深夜食堂","B1":"锅底蘸料配菜，一次买齐",
"B3":"下午三点，茶水间见","B5":"卤味管够，配酒刚好","C3":"四个人，一桌火锅",
"D1":"请客那天，只差肉和青菜","D3":"一整箱，慢慢吃一个月","D5":"全家人的零食柜","D6":"76 件，够全组吃一周"}

# (品牌, 品名, 口味) —— 卡片上的规范显示名，口味取最短区分写法
DISP = {
 1:("乐事","波浪薯片","鱿鱼"), 2:("乐事","薯片","黄瓜"), 3:("乐事","薯片","烤肉"),
 4:("劲仔","小鱼","酱汁"), 5:("劲仔","小鱼","香辣"),
 6:("喜之郎","果冻","水蜜桃"), 7:("喜之郎","果冻","红葡萄"),
 8:("巧福娃","蟹味棒","香辣"), 9:("巧福娃","蟹味棒","麻酱"),
 12:("巧福娃","素毛肚","香辣"), 13:("巧福娃","贡菜","酸辣"), 14:("巧福娃","贡菜","香辣"),
 15:("巧福娃","豆卷香肠","香辣"), 16:("巧福娃","豆卷鹌鹑蛋","香辣"),
 18:("巧福娃","宽粉","酸爽"), 19:("巧福娃","宽粉","香辣"),
 23:("三养","火鸡面","经典黑"), 24:("好欢螺","螺蛳粉","原味"),
 30:("海底捞","蘸料","香辣"), 31:("海底捞","蘸料","麻辣"), 32:("海底捞","牛油底料",""),
 33:("海底捞","芝麻酱",""), 34:("海底捞","菌汤底料",""),
 35:("珠江桥","生抽",""), 36:("珠江桥","老抽",""),
 39:("小胡鸭","蒜香凤爪",""), 40:("小胡鸭","柠檬凤爪",""), 41:("小胡鸭","虎皮凤爪",""),
 43:("小胡鸭","鸭翅","香辣"), 44:("小胡鸭","鸭脖","香辣"), 45:("小胡鸭","鸭锁骨","香辣"),
 46:("奥利奥","饼干","抹茶"), 47:("奥利奥","饼干","白桃乌龙"),
 49:("榙榙","芒果干",""), 52:("乌江","榨菜",""), 53:("开口爽","酸豆角",""), 54:("","干腐竹",""),
}

def pack_sub(items, cap):
    """同一品牌只出现一次；同品名的不同口味合并为 (味1/味2)"""
    groups, order = {}, []
    for k, v in items:
        brand, base, flav = DISP[k]
        key = (brand, base)
        if key not in groups:
            groups[key] = []
            order.append(key)
        if flav and flav not in groups[key]:
            groups[key].append(flav)
    parts, last = [], None
    for brand, base in order:
        nm = base if (brand == last or not brand) else "%s %s" % (brand, base)
        fl = groups[(brand, base)]
        if fl: nm += "(%s)" % "/".join(fl)
        parts.append(nm)
        last = brand
    out = []
    for p in parts:
        if out and len("、".join(out + [p])) > cap:
            return "、".join(out) + " 等"
        out.append(p)
    return "、".join(out)

def item_rows(r):
    """小包：全部 SKU 列出，品牌在本卡内只出现一次"""
    q = r['qty']
    val = {k: v*SKU[k]['rrp'] for k, v in q.items()}
    brank = {}
    for k, v in q.items():
        b = DISP[k][0]
        brank[b] = brank.get(b, 0) + val[k]
    seen, rows = set(), []
    for k, v in sorted(q.items(), key=lambda kv: (-brank[DISP[kv[0]][0]], -val[kv[0]])):
        brand, base, flav = DISP[k]
        nm = base if (brand in seen or not brand) else "%s %s" % (brand, base)
        if flav: nm += "(%s)" % flav
        seen.add(brand)
        rows.append((nm, v))
    return rows

def lines_for(r):
    """mode=big -> [(类目, 件数, 明细)]；否则 small"""
    q = r['qty']
    if r['n'] > 30:
        agg = {}
        for k, v in q.items():
            c = CAT.get(k, "其他")
            agg.setdefault(c, [0, []])
            agg[c][0] += v
            agg[c][1].append((k, v))
        top = sorted(agg.items(), key=lambda x: -x[1][0])[:5]
        big = max(range(len(top)), key=lambda i: top[i][1][0])
        rows = []
        for i, (c, v) in enumerate(top):
            items = sorted(v[1], key=lambda kv: -kv[1])
            rows.append((c, v[0], pack_sub(items, 74 if i == big else 36)))
        return "big", rows
    return "small", item_rows(r)

def render_items(r):
    mode, rows = lines_for(r)
    if mode == "big":
        html = "".join('<li><div class="cl"><b>%s</b><span>%d 件</span></div><div class="cs">%s</div></li>' % (c, n, sub)
                       for c, n, sub in rows)
        return html, ""
    html = "".join("<li>%s <b>\u00d7%d</b></li>" % (nm, n) for nm, n in rows)
    def w(t):  # 估算字宽：汉字 1，其余 0.58
        return sum(1.0 if ord(c) > 127 else 0.58 for c in t)
    need = max(w(nm) + 1.7 for nm, _ in rows)   # +1.7 给「×N」
    nrow = (len(rows) + 1) // 2
    size = max(26, min(46, int(392 / need)))
    gap = 28 if nrow <= 3 else 20 if nrow <= 4 else 13
    return html, 'style="font-size:%dpx;row-gap:%dpx"' % (size, gap)

LOGO = "data:image/png;base64," + base64.b64encode(open(os.path.join(BASE,'logo_chip.png'),'rb').read()).decode()
CARD = open(os.path.join(BASE,'card.tpl'), encoding='utf-8').read()
OVER = open(os.path.join(BASE,'overview.tpl'), encoding='utf-8').read()

def card_html(r):
    ship = '<span class="ship">包邮</span>' if r['free'] else ''
    return (CARD.replace('{{LOGO}}',LOGO).replace('{{CODE}}',r['code']).replace('{{NAME}}',r['name'])
            .replace('{{TAG}}',TAG.get(r['code'],'')).replace('{{PRICE}}',"{:,}".format(r['P']))
            .replace('{{ORIG}}',"{:,}".format(r['R'])).replace('{{SAVE}}',"{:,}".format(r['save']))
            .replace('{{ITEMS}}', render_items(r)[0])
            .replace('{{BOXMODE}}', lines_for(r)[0])
            .replace('{{BOXSTYLE}}', render_items(r)[1])
            .replace('{{N}}',str(r['n'])).replace('{{NS}}',str(r['ns']))
            .replace('{{AVG}}',str(round(r['P']/r['n']))).replace('{{SHIP}}',ship)
            .replace('{{KG}}',str(r['kg'])))

def overview_html():
    out = ""
    for r in rows:
        ship = '<span class="ok">包邮</span>' if r['free'] else '<span class="no"></span>'
        out += ('<div class="row"><span class="c">%s</span><span class="nm">%s</span>'
                '<span class="n">%d 件</span><span class="p">%s</span>%s</div>'
                % (r['code'], r['name'], r['n'], "{:,}".format(r['P']), ship))
    return OVER.replace('{{LOGO}}',LOGO).replace('{{ROWS}}',out)

OUT = os.path.join(BASE,'social'); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(BASE,'_html'); os.makedirs(TMP, exist_ok=True)
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
jobs = [(os.path.join(OUT,'01-速览.png'), overview_html())]
for i,r in enumerate(rows, start=2):
    jobs.append((os.path.join(OUT, "%02d-%s-%s.png" % (i, r['code'], r['name'])), card_html(r)))
for path, h in jobs:
    f = os.path.join(TMP, os.path.basename(path).replace('.png','.html'))
    open(f,'w',encoding='utf-8').write(h)
    subprocess.run([EDGE,"--headless=new","--disable-gpu","--hide-scrollbars","--force-device-scale-factor=1",
                    "--screenshot="+path,"--window-size=1080,1350","file:///"+f.replace('\\','/')],
                   check=True, capture_output=True)
    print("ok", os.path.basename(path))
