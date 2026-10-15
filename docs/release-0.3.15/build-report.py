"""Rebuild the Chinese beta review PDF from the saved review evidence."""
from pathlib import Path
import json, html, re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
ROOT=Path(__file__).resolve().parents[2]
data=json.loads((Path(__file__).parent/'evidence.json').read_text())
assert isinstance(data.get('productionVerification'),dict) and all(data['productionVerification'].values()), 'Production verification is incomplete'
OUT=ROOT/'output/pdf/Polynomial-0.3.15-发布前检查清单.pdf'
font=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
if font.exists():pdfmetrics.registerFont(TTFont('CJK',str(font)))
else:
 from reportlab.pdfbase.cidfonts import UnicodeCIDFont
 pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
fontname='CJK' if font.exists() else 'STSong-Light'
styles=getSampleStyleSheet()
for name in ['Normal','BodyText','Heading1','Heading2','Heading3','Title']:
 styles[name].fontName=fontname;styles[name].wordWrap='CJK';styles[name].textColor=colors.HexColor('#203A36')
styles['Normal'].fontSize=10;styles['Normal'].leading=16
styles.add(ParagraphStyle(name='SmallCJK',fontName=fontname,fontSize=8.5,leading=12.5,wordWrap='CJK',textColor=colors.HexColor('#52655F')))
styles['Heading1'].fontSize=22;styles['Heading1'].leading=30;styles['Heading1'].spaceAfter=16
styles['Heading2'].keepWithNext=True;styles['Heading1'].keepWithNext=True;styles['Heading2'].fontSize=14;styles['Heading2'].leading=21;styles['Heading2'].spaceBefore=14;styles['Heading2'].spaceAfter=8
styles['Title'].fontSize=30;styles['Title'].leading=42;styles['Title'].alignment=TA_LEFT
story=[]
def p(text,kind='Normal'):return Paragraph(html.escape(str(text)).replace('\n','<br/>'),styles[kind])
def add(text,kind='Normal'):
 story.append(p(text,kind))
 if not kind.startswith('Heading'):story.append(Spacer(1,6))
def title(n,text):add(f'{n}  /  {text}','Heading1')
def table(headers,rows,widths,padding=8):
 cells=[[p(x,'SmallCJK') for x in headers]]+[[p(x,'SmallCJK') for x in row] for row in rows]
 t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E3EEE9')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),padding),('BOTTOMPADDING',(0,0),(-1,-1),padding),('LINEBELOW',(0,0),(-1,-1),.3,colors.HexColor('#DAE4E0')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F7F9F8')])]))
 story.append(t)
def page():story.append(PageBreak())
def bullet(text):add('• '+text)
add('POLYNOMIAL  /  BETA REVIEW','SmallCJK');story.append(Spacer(1,32))
add('发布前检查清单','Title');add('界面与服务 0.3.15','Heading2');add(data['date']+' · 北京时间')
add('本报告记录本轮实际检查、修复、验证证据与尚待设备验收的项目。已完成所列范围内的自动化回归和线上检查，不代表所有系统、所有条件按钮及外部服务均已完成真机验证。')
story.append(Spacer(1,16))
table(['检查项','结果'],[
 ['静态检查','通过'],['后端测试',f"{data['unitTests']} 项通过"],['浏览器回归',f"{len(data['tests'])} 项场景通过"],['点击记录',f"{data['clickCount']} 次，含链接与折叠区；不是不同按钮数量"],['页面与视图',f"{len(data['inventory'])} 个已登录路径/视图 + {len(data['publicInventory'])} 个未登录入口"],['布局尺寸','360、390、1440 像素；未发现横向溢出'],['线上部署与数据','健康检查通过；原有账号、消息、文件和 AI 历史完整性检查通过'],['安装包','7 个平台/芯片组合，服务器本地与 GitHub 备用下载的大小 / SHA-256 均通过']],[115,384])
add('发布范围','Heading2');add('本轮发布网页与服务器。Android 安装包为 0.3.12；macOS、Windows、Linux 为 0.3.8。iOS 为 Safari 主屏幕应用，未提供签名 IPA。现有客户端联网加载新界面。')
add('结论','Heading2');add('已检查的自动化和线上项目通过，可作为内部测试版候选。系统安装、后台通知、真实模型与外部运行环境的剩余验收见第 7 节。')
page();title('02','功能检查：账号、消息与文件')
rows=[
 ('账号登录','账号密码登录、登录错误、退出、登录后的目标页跳转','自动通过'),
 ('账号管理','创建/编辑/停用、重设密码、新密码登录、旧会话撤销、最后管理员保护','自动通过'),
 ('账号安全','管理员 TOTP、一次性恢复码、改密、设备会话退出；恢复码有效期及失败处理','自动通过；物理屏幕显示待验收'),
 ('角色分区','管理员、成员、访客的管理区域与 API 限制；直接打开管理视图的回退','自动通过'),
 ('访客隔离','禁聊天/围棋/公共盘/分享；私人盘、日程、小游戏、计算器；降级撤销旧会话与分享','自动通过'),
 ('聊天送达','双账号发送与接收、断开后补收、防重复、未读状态','浏览器自动通过；安卓真机待验收'),
 ('聊天操作','新建群组/私聊、返回列表、回复/编辑/删除、附件与网盘选择、取消弹窗','自动通过'),
 ('聊天提醒','站内提醒、通知桥接的开启/测试/关闭调用','桥接自动通过；系统实际通知待验收'),
 ('个人资料','照片头像、Emoji、昵称、简介、颜色、聊天偏好保存及越权修改拒绝','自动通过'),
 ('网盘文件','上传、下载、删除、选择保存范围、配额、分享与取消分享窗口','自动通过'),
 ('文件隔离','私有内容归属校验、共享对象限制、访客 32 MB 上限与禁公共盘','自动通过'),
 ('资源下载','版本/平台/芯片筛选、下载进度、取消、SHA-256、公开发布/下架','自动通过 + 线上安装包校验')]
table(['模块','检查内容','状态'],rows,[80,309,110])
add('证据与边界','Heading2');add('功能操作使用临时数据库、独立测试账号和真实 Chromium。未批量改动线上用户密码、权限、聊天或文件。测试账号内容不代表生产数据。')
page();title('03','功能检查：AI、日程与后台')
rows=[
 ('AI 会话','新建、切换、独立草稿、重命名、置顶、归档/恢复、导出、删除确认','自动通过'),
 ('AI 工具','九个工具入口、自定义模板增改删、归属隔离、附加文本预览与移除','自动通过；访客仅六个工具'),
 ('AI 回复','发送/等待、复制、LaTeX 公式显示、计划写入日历、调用记录详情','模拟模型自动通过'),
 ('AI 额度','个人/全站次数和 Token、并发预留、失败计量、访客 5 次/天与 30 次/月上限','后端与浏览器通过'),
 ('低峰队列','排队发送、查看所在会话、取消与权限校验','自动通过'),
 ('计划日历','新增/编辑/完成/暂停/恢复/删除、日期切换、筛选、搜索和冲突保护','自动通过'),
 ('每日回顾','打开/关闭、勾选明日安排、保存结果、与日历跳转','自动通过'),
 ('离线日程','设备主动开启、只读副本、重连刷新、账号退出清理','浏览器自动通过'),
 ('服务器管家','登录统计时间区间、权限提案、确认/取消、跳转编辑账号','自动通过'),
 ('巡检与任务','间隔保存、基础报告、模拟 AI 巡检、任务状态与调度','自动通过；真实模型待验收'),
 ('备份与日志','备份创建/下载/恢复验证、留存设置、登录日志、审计与状态展示','自动通过 + 部署备份验证'),
 ('学习与游戏','课程/课节/笔记/完成、草稿/导出；消消乐全部主控制；围棋研究/偏好/SGF/题库编辑','自动通过；外部执行见第 7 节')]
table(['模块','检查内容','状态'],rows,[80,309,110])
add('模型验证说明','Heading2');add('浏览器测试使用隔离进程中的模型模拟响应，真实 DeepSeek 请求被拦截，不使用生产密钥、不消耗实际额度。因此不能据此确认当前生产密钥、账户余额、模型可用性或真实回复质量。')
page();title('04','页面、链接与区域清单')
add('每个已登录路径均检查页面可达、主内容、标题、站内链接、静态资源和三种宽度布局。相同应用的不同标签页分别列出。控件数量包含隐藏、折叠和条件控件；不等于逐一点击数量。','SmallCJK')
rows=[]
for item in data['inventory']:
 rows.append([item['route'],str(len(item['buttons'])),'页面/链接/布局通过'])
for item in data['publicInventory']:rows.append([item['route'],'入口检查','未登录访问通过'])
table(['路径 / 视图','控件盘点','结果'],rows,[292,80,127],padding=4)
add(f"对 {len(data['destinations'])} 个去重站内目标执行 GET 可达检查；页面内普通锚点检查目标存在。API 权限及有副作用的操作由对应功能场景验证。三个项目 GitHub 仓库链接另经 GitHub API 核实。",'SmallCJK')
page();title('05','本轮问题与文案修订')
table(['发现的问题','处理'],[
 ['项目页源码按钮仍是占位符','替换为本站 GitHub 仓库，核实三个项目链接。'],
 ['登录后丢失原页面，目标地址还需站内校验','保留路径、参数与标签；拒绝反斜线等站外目标，增加回归。'],
 ['登录页写“开发者登录”，与成员和访客范围不符','改为“登录账号”，使用简短登录说明。'],
 ['下载页安装说明停留在早期版本','改为当前安装方式，保留桌面未签名和早期安卓签名兼容说明。'],
 ['私聊标题反复显示后台可见性说明','标题简化为“私聊”；消息与 AI 数据访问范围集中到“隐私与数据说明”。'],
 ['首页、助手和工具存在重复、空泛或未来式描述','精简简介、装饰标签、工具说明、服务状态、空状态和反馈文案。'],
 ['会话副标题暴露“独立上下文”等实现术语','改为当前工具名称；归档和回复中的状态仍明确显示。'],
 ['公网传输较慢，下载 HEAD 查询返回 404','增加经校验的 GitHub 备用地址；支持 HEAD，保留主下载进度与校验。'],
 ['云端暴露发布路由与测试平台差异','将隐私页面路由纳入发布；下载巡检显式选取测试安装包所在的平台。'],
 ['网盘选择弹窗图标缺少明确名称','补充“关闭网盘选择”，方便读屏与定位。'],
 ['旧回归用装饰文案判断工具切换','改为校验实际工具名称，重新通过回归。']],[185,314])
add('保留会影响用户决定的信息','Heading2');add('删除不可恢复、额度限制、外部邮箱未连接、后台通知条件、安装包签名及数据处理说明均保留。管理后台中的单位、参数范围和审计设置属于操作信息，未作为装饰性文案删除。')
add('隐私说明入口','Heading2');add('聊天侧栏、AI 对话区域、应用页脚与网站页脚均可进入。说明如实列出消息的服务器存储、管理员管理权限、DeepSeek 处理范围、历史及备份留存和设备通知设置。')
page();title('06','发布记录与待设备验收')
add('本轮发布证据','Heading2')
for text in [f"代码提交：{data['codeCommit']}",f"GitHub 云端验证：{data['ciUrl']}",'部署：线上健康检查返回 0.3.15，更新公告存在，服务正常。','数据：原有账号及密码散列、文件、消息、AI 历史保留；数据库完整性与会话归属检查通过。','备份：部署前完整数据归档；部署备份恢复校验通过。','回退代码：codex/before-v0315-beta-review，支持访客角色。']:bullet(text)
table(['安装包','版本','大小 / SHA-256'],[[r['platform']+' / '+r['architecture'],r['version'],'通过'] for r in data['installers']],[229,100,170])
page();title('07','待设备与外部环境验收')
for text in [
 'Android：真实设备首次安装、覆盖更新、息屏/省电/系统终止后的送达和系统通知；自动化仅验证网页流程与原生桥接。',
 'macOS / Windows / Linux：在每个目标系统与芯片上实际安装、首次启动、签名提示、系统通知和依赖兼容；下载哈希通过不等于安装运行通过。',
 'iOS：Safari 主屏幕安装、通知授权和后台 Web Push；尚无 TestFlight / App Store / 签名 IPA。',
 'DeepSeek：使用生产账户验证真实调用、余额/费用、真实模型生成质量与跨日低峰执行。',
 'Python/Jupyter 与 KataGo：本次线上仅确认控制器响应、引擎文件和版本命令。真实容器运行、作业评测、人机落子与终局计分未由此次隔离回归完成。',
 '物理恢复流程：服务器屏幕上恢复码的实际显示，需要在服务器现场确认。']:
 bullet('待验收：'+text)
add('公网主下载曾在 35 秒内仅收到约 0.9 MB，超过测试超时；服务器本地同一文件约 0.006 秒读取完成。GitHub 备用下载七个包均完整下载并通过哈希。主链路速度仍受网络影响。','SmallCJK')
add('最终回归未发现本轮已覆盖范围内的失败项。上述未验收项目不应标注为“全部正常”或“全平台认证完成”。','SmallCJK')
page();title('08','控件盘点附录')
add('以下列出从页面 DOM 收集到的按钮、折叠标题和提交控件。已操作表示测试记录中存在对应点击；已盘点表示已检查结构但没有独立点击证据，可能为隐藏、禁用、条件按钮或等效重复入口。记录匹配采用页面路径与控件 ID/文字，不证明所有输入和错误分支都已穷举。','SmallCJK')
actions=data['actions'];seen=set();groups={}
for item in data['inventory']:
 path=item['route'].split('?')[0].split('#')[0]
 group=groups.setdefault(path,{'已操作':[],'已盘点':[]})
 for control in item['buttons']:
  key=(path,control['id'],control['label'])
  if key in seen:continue
  seen.add(key)
  clicked=any(a['page']==path and ((control['id'] and a.get('id')==control['id']) or (not control['id'] and a.get('label')==control['label'])) for a in actions)
  label=control['label'][:90] or control['id'] or '无文字控件'
  if control['disabled']:label+=' [禁用]'
  group['已操作' if clicked else '已盘点'].append(label)
add(f'去重盘点 {len(seen)} 个控件实例。完整控件 ID、可见状态与原始点击记录保存在随报告同步的 evidence.json。','SmallCJK')
for path,group in groups.items():
 add(path,'Heading2');rows=[]
 for status,names in group.items():
  for i in range(0,len(names),10):rows.append([status,'；'.join(names[i:i+10])])
 table(['证据','控件名称'],rows,[65,434])
add('复现与记录','Heading2');add('npm run check；npm test；npm run test:browser；node scripts/button-audit-report.js。完整场景与点击记录见 GitHub 验证任务的 browser-test-report 附件。本报告依据 docs/release-0.3.15/evidence.json 生成。','SmallCJK')
def footer(canvas,doc):
 canvas.setStrokeColor(colors.HexColor('#DCE7E1'));canvas.line(48,42,547,42);canvas.setFont(fontname,8);canvas.setFillColor(colors.HexColor('#65766F'));canvas.drawString(48,28,'POLYNOMIAL  /  0.3.15 发布检查');canvas.drawRightString(547,28,f'{doc.page}')
OUT.parent.mkdir(parents=True,exist_ok=True)
SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=48,rightMargin=48,topMargin=48,bottomMargin=58,title='Polynomial 0.3.15 发布前检查清单',author='Polynomial').build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
