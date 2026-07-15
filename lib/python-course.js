const crypto = require('node:crypto');

const P = text => ({ type: 'p', text });
const C = code => ({ type: 'code', code });
const T = text => ({ type: 'tip', text });
const H = (title, text) => ({ type: 'heading', title, text });
const L = (id, title, duration, summary, body, assignmentId = null) => ({ id, title, duration, summary, body, ...(assignmentId ? { assignmentId } : {}) });

const chapters = [
  {
    id: 'object-intro', number: 1, title: '走进 Python：对象、类型与点号',
    description: '先通过大量可运行的例子建立对象思维，理解 Python 代码中随处可见的点号。',
    lessons: [
      L('program-first-look', '程序是在让对象协作', 16, '从值、变量和操作出发，第一次观察 Python 程序。', [
        H('程序、数据与操作', '程序不只是命令清单。它保存数据、让数据参与运算，并把结果交给下一个步骤。Python 会把运行中的数据表示成对象。'),
        C('message = "Hello, Python!"\ncount = 3\nprint(message)\nprint(count + 2)'),
        H('什么叫对象', '对象可以理解为程序中的一个具体“东西”：它有类型、有自己的值，并支持一组操作。字符串、整数、列表，甚至函数和类本身都是对象。'),
        C('print(type("hello"))\nprint(type(42))\nprint(type([1, 2, 3]))\nprint(type(print))'),
        T('“万物皆为对象”不是说所有对象都一样，而是说它们都遵守对象模型：拥有类型，并由类型决定可以做什么。')
      ]),
      L('class-instance-preview', '类、实例与面向对象的第一印象', 18, '理解类像规则或蓝图，实例是按照规则创建的具体对象。', [
        H('什么叫面向对象', '面向对象是一种组织程序的方式：把相关的数据和行为放在一起，由对象负责自己的状态和操作。复杂系统由多个职责清楚的对象协作完成。'),
        H('类与实例', '类描述一类对象共同具有的数据和行为；实例是某个具体对象。下面的 Student 是类，ada 和 lin 是两个互不相同的实例。'),
        C('class Student:\n    def __init__(self, name):\n        self.name = name\n\n    def introduce(self):\n        return f"我是 {self.name}"\n\nada = Student("Ada")\nlin = Student("Lin")\nprint(ada.introduce())\nprint(lin.introduce())'),
        T('现在只需形成直觉。第 9 章会系统学习类、实例、属性、方法和继承。')
      ]),
      L('dot-notation', '点号到底表示什么', 20, '看懂对象.属性和对象.方法()，区分数据与行为。', [
        H('对象.属性', '点号可以访问对象携带的信息。例如实例的 name 是属性；属性通常描述对象当前的状态。'),
        C('class Lamp:\n    def __init__(self, color):\n        self.color = color\n\nlamp = Lamp("blue")\nprint(lamp.color)'),
        H('对象.方法()', '点号后带括号通常表示调用方法。方法是和对象类型相关联的函数，描述对象能够执行的行为。'),
        C('name = "ada lovelace"\nprint(name.title())\nprint(name.upper())\n\nnumbers = [3, 1, 2]\nnumbers.sort()\nprint(numbers)'),
        H('属性与方法的区别', '属性通常直接取值，如 lamp.color；方法需要调用，如 name.upper()。括号意味着“现在执行这个行为”，还可以在括号中传入参数。'),
        T('看到点号时可以问三个问题：点号左边是什么对象？右边是属性还是方法？这个操作会返回新对象，还是修改原对象？')
      ], 'object-description'),
      L('built-in-objects', '常见对象的行为体验', 22, '比较字符串、列表、字典和数字对象提供的不同操作。', [
        H('字符串对象', '字符串不可变。upper()、replace() 等方法返回新字符串，原字符串不改变。'),
        C('text = "python objects"\nchanged = text.upper().replace("OBJECTS", "METHODS")\nprint(text)\nprint(changed)'),
        H('列表对象', '列表可变。append() 和 sort() 会修改同一个列表对象。'),
        C('tasks = ["read", "code"]\ntasks.append("test")\ntasks.sort()\nprint(tasks)'),
        H('字典对象', '字典用键查找值，get() 可以在键不存在时返回默认值。'),
        C('profile = {"name": "Ada", "score": 96}\nprint(profile.get("name"))\nprint(profile.get("city", "unknown"))'),
        H('数字也是对象', '整数也有类型和方法。例如 bit_length() 返回表示这个整数至少需要多少个二进制位。'),
        C('number = 10\nprint(number.bit_length())\nprint((3.14159).as_integer_ratio())')
      ]),
      L('object-identity', '类型、身份、可变性与方法链', 18, '用 type()、id() 和方法链继续观察对象。', [
        H('类型与身份', 'type() 查看对象的类型；id() 是对象在本次运行中的身份标识。两个值相等的对象不一定是同一个对象。'),
        C('first = [1, 2]\nsecond = [1, 2]\nalias = first\nprint(first == second, first is second)\nprint(first is alias)\nprint(id(first), id(alias))'),
        H('方法链', '当一个方法返回对象时，可以继续对返回对象使用点号。阅读方法链时从左向右跟踪每一步产生的对象。'),
        C('raw = "  ada lovelace  "\nresult = raw.strip().title().replace("Ada", "Augusta Ada")\nprint(result)'),
        H('函数和类也是对象', '函数有 __name__ 等属性，也能赋值给变量；类本身可被调用来创建实例。这是 Python 灵活性的来源之一。'),
        C('def greet(name):\n    return f"Hello, {name}"\n\naction = greet\nprint(action.__name__)\nprint(action("Grace"))')
      ]),
      L('intro-summary', '导入小结：带着对象问题继续学习', 10, '建立贯穿后续课程的观察框架。', [
        P('以后遇到一个新值，先确认它的类型；遇到点号，先确认左边的对象；调用方法后，再判断它返回新对象还是修改原对象。变量、容器、函数和类都可以用这套方式理解。'),
        C('items = ["  python", "OBJECT", "method  "]\ncleaned = [item.strip().lower() for item in items]\nprint(type(items), cleaned)'),
        T('第一章重在体验，不要求立即掌握类的全部语法。接下来从变量和简单数据类型开始逐步建立基础。')
      ])
    ]
  },
  {
    id: 'foundations', number: 2, title: '变量和简单数据类型',
    description: '理解程序运行、变量、字符串、数字、注释和 Python 的可读性原则。',
    lessons: [
      L('hello-world', '运行 hello_world.py 时发生的情况', 14, '从源文件、解释器到标准输出，理解第一段程序。', [
        H('源文件与解释器', '扩展名 .py 表示 Python 源文件。解释器读取文件，检查语法，再从上到下执行语句。'),
        C('message = "Hello, world!"\nprint(message)'),
        H('表达式与输出', '执行 print() 前，Python 会先计算括号中的表达式，再把得到的对象转换为可显示文本并写入标准输出。'),
        T('报错时从最后一行开始读：它通常给出错误类型和最直接的原因，再结合文件名与行号定位。')
      ], 'hello-function'),
      L('variables', '变量：命名、使用与避免名称错误', 20, '把名称绑定到对象，并读懂常见 NameError。', [
        H('变量', '变量是绑定到对象的名称。重新赋值会让名称改为指向另一个对象，并不会改变旧对象本身。'),
        C('message = "first"\nprint(message)\nmessage = "second"\nprint(message)'),
        H('变量的命名和使用', '名称可包含字母、数字和下划线，但不能以数字开头；不能使用关键字。推荐小写单词加下划线，并让名称表达用途。'),
        C('student_name = "Ada"\ncompleted_lessons = 3\nprint(student_name, completed_lessons)'),
        H('使用变量时避免命名错误', 'Python 区分大小写。名称未定义或拼写不一致会产生 NameError。检查赋值是否先发生、拼写是否一致、作用域是否正确。'),
        C('score = 96\n# print(Score)  # NameError：Score 与 score 不同\nprint(score)')
      ]),
      L('strings-case', '字符串与修改大小写的方法', 17, '创建字符串，并使用 title()、upper() 和 lower()。', [
        H('字符串', '字符串是字符组成的不可变序列，可以使用单引号、双引号或三引号创建。'),
        C('single = \'Python\'\ndouble = "object"\nmultiline = """first line\nsecond line"""\nprint(single, double, multiline)'),
        H('使用方法修改字符串的大小写', 'title()、upper() 和 lower() 返回新字符串，不修改原字符串。lower() 常用于不区分大小写的比较。'),
        C('name = "grace hopper"\nprint(name.title())\nprint(name.upper())\nprint(name.lower())\nprint(name)')
      ]),
      L('strings-compose', '拼接字符串并使用制表符和换行', 18, '组合文本并用转义序列组织输出。', [
        H('合并（拼接）字符串', '可以用 + 拼接字符串，现代 Python 更推荐 f-string，因为它能直接插入不同类型的值。'),
        C('first = "Ada"\nlast = "Lovelace"\nfull = first + " " + last\nprint(full)\nprint(f"姓名：{full}")'),
        H('使用制表符或换行符来添加空白', '\\t 表示制表符，\\n 表示换行。它们是字符串中的转义序列，不是两个普通字符。'),
        C('print("Languages:\\n\\tPython\\n\\tJavaScript")')
      ], 'profile-line'),
      L('strings-clean', '删除空白并避免字符串语法错误', 18, '清理字符串边界并正确搭配引号。', [
        H('删除空白', 'strip() 删除两端空白，lstrip() 只处理左边，rstrip() 只处理右边。它们都返回新字符串。'),
        C('value = "  Python  "\nprint(repr(value.lstrip()))\nprint(repr(value.rstrip()))\nprint(repr(value.strip()))'),
        H('使用字符串时避免语法错误', '引号必须成对。文本包含单引号时可用双引号包围，反之亦然；也可以使用反斜杠转义。'),
        C('message = "Python\'s syntax is readable."\nquote = \'他说：“继续练习。”\'\nprint(message, quote)'),
        H('Python 2 中的 print 语句', 'Python 2 曾允许 print "hello" 这种语句形式。Python 3 中 print 是函数，必须使用括号。本课程只运行 Python 3。'),
        C('print("这是 Python 3 的 print() 函数")')
      ], 'clean-name'),
      L('numbers', '整数、浮点数与类型转换', 22, '进行数值运算，并在文本中安全使用数字。', [
        H('整数', '整数没有小数部分，支持加减乘除、幂和整除。/ 返回浮点数，// 执行向下取整的整除。'),
        C('print(2 + 3, 7 - 4, 3 * 5, 2 ** 8)\nprint(7 / 2, 7 // 2, -7 // 2)'),
        H('浮点数', '浮点数使用二进制近似表示，因此某些十进制运算会出现很小的误差。需要精确小数时可学习 decimal 模块。'),
        C('print(0.1 + 0.2)\nprice = 19.5\nprint(f"{price:.2f}")'),
        H('使用函数 str() 避免类型错误', '字符串不能直接和整数用 + 拼接。str() 可以得到数字的文本表示；f-string 通常更简洁。'),
        C('age = 18\nprint("年龄：" + str(age))\nprint(f"明年：{age + 1}")'),
        H('Python 2 中的整数', 'Python 2 中两个整数使用 / 可能执行整数除法；Python 3 中 / 总是返回浮点数，// 明确表示整除。')
      ]),
      L('comments-zen', '注释与 Python 之禅', 16, '写有价值的注释，并理解清晰、简单、可读的重要性。', [
        H('注释', '# 后面的内容不会作为普通语句执行。注释用于帮助读者理解代码。'),
        H('如何编写注释', '注释前使用 # 和一个空格。短注释放在相关代码上方，避免在行尾堆叠过长说明。'),
        C('# 将分钟换算为秒，便于和计时器结果比较\nminutes = 5\nseconds = minutes * 60\nprint(seconds)'),
        H('该编写什么样的注释', '优先解释为什么这样设计、有哪些限制，而不是逐字复述代码。代码变化时必须同步更新注释。'),
        H('Python 之禅', '运行 import this 可以查看 Python 之禅。清晰优于晦涩，简单优于复杂，可读性很重要。'),
        C('import this')
      ]),
      L('foundations-summary', '变量和简单数据类型小结', 10, '回顾变量、字符串、数字与注释。', [P('你已经能运行 Python 文件、创建变量、处理字符串与数字、编写注释，并能识别一部分 Python 2 与 Python 3 的历史差异。下一章使用列表管理一组有顺序的数据。')])
    ]
  },
  {
    id: 'list-intro', number: 3, title: '列表简介', description: '创建列表，访问、修改、添加、删除并组织元素。',
    lessons: [
      L('list-basics', '列表是什么：元素、索引与值', 19, '理解有序可变容器和从 0 开始的索引。', [
        H('列表是什么', '列表使用方括号保存一组有顺序的对象，元素可以是相同或不同类型。'),
        C('languages = ["Python", "Go", "Rust"]\nprint(languages)'),
        H('访问列表元素', '在列表后使用方括号和索引取得元素；负索引从末尾开始，-1 表示最后一个。'),
        C('languages = ["Python", "Go", "Rust"]\nprint(languages[0])\nprint(languages[-1])'),
        H('索引从 0 而不是 1 开始', '索引表示元素相对列表开头的偏移量，第一个元素的偏移量是 0。'),
        H('使用列表中的各个值', '取出的元素就是普通对象，可以继续调用方法、参与表达式或插入 f-string。'),
        C('languages = ["Python", "Go", "Rust"]\nprint(f"我正在学习 {languages[0].upper()}")')
      ]),
      L('list-change', '修改、添加和删除元素', 24, '使用索引和常用列表方法更新内容。', [
        H('修改列表元素', '列表是可变对象，可以通过索引为现有位置赋新值。'),
        C('tasks = ["read", "sleep"]\ntasks[1] = "practice"\nprint(tasks)'),
        H('在列表中添加元素', 'append() 在末尾添加，insert() 在指定索引前插入。'),
        C('tasks = ["read", "practice"]\ntasks.append("review")\ntasks.insert(1, "note")\nprint(tasks)'),
        H('从列表中删除元素', 'del 按索引删除；pop() 删除并返回元素；remove() 删除第一次出现的指定值。'),
        C('tasks = ["read", "note", "practice", "review"]\ndone = tasks.pop(0)\ntasks.remove("review")\ndel tasks[0]\nprint(done, tasks)'),
        T('还需要被删除的值时用 pop()；只知道值时用 remove()；确定索引且不需要返回值时可用 del。')
      ]),
      L('list-order', '组织列表：排序、反转与长度', 21, '区分永久排序和临时排序。', [
        H('使用方法 sort() 对列表进行永久性排序', 'sort() 原地修改列表，返回值是 None。可以设置 reverse=True 使用降序。'),
        C('names = ["Lin", "Ada", "Guido"]\nresult = names.sort()\nprint(names)\nprint(result)'),
        H('使用函数 sorted() 对列表进行临时排序', 'sorted() 返回新的排序列表，原列表顺序保持不变。'),
        C('names = ["Lin", "Ada", "Guido"]\nprint(sorted(names))\nprint(names)'),
        H('倒着打印列表', 'reverse() 永久反转当前顺序；reversed() 返回可迭代的反向视图，也可用切片 [::-1] 创建新列表。'),
        C('names = ["Lin", "Ada", "Guido"]\nnames.reverse()\nprint(names)\nprint(list(reversed(names)))'),
        H('确定列表的长度', 'len() 返回元素数量，空列表长度为 0。'),
        C('names = ["Lin", "Ada", "Guido"]\nprint(len(names), len([]))')
      ], 'sorted-copy'),
      L('list-index-errors', '使用列表时避免索引错误', 14, '在访问前确认边界并安全处理空列表。', [
        H('索引错误', '索引必须处于 -len(items) 到 len(items)-1 的范围。空列表没有索引 0，也没有索引 -1。'),
        C('items = []\nif items:\n    print(items[-1])\nelse:\n    print("列表为空")'),
        T('出现 IndexError 时，先打印 len(items) 和正在使用的索引，再检查循环边界。')
      ]),
      L('list-intro-summary', '列表简介小结', 9, '回顾列表的创建、访问和组织。', [P('列表是有序可变容器。你已经能使用索引访问元素，使用 append()、insert()、pop()、remove() 更新列表，并能选择 sort() 或 sorted() 组织顺序。')])
    ]
  },
  {
    id: 'list-operations', number: 4, title: '操作列表', description: '使用循环、range()、列表解析、切片和元组批量处理数据。',
    lessons: [
      L('for-loops', '遍历整个列表', 22, '理解 for 循环的执行过程和循环结束后的代码。', [
        H('遍历整个列表', 'for 循环按顺序从可迭代对象取得元素，并在每次迭代中把元素绑定到循环变量。'),
        C('students = ["Ada", "Lin", "Sam"]\nfor student in students:\n    print(student)'),
        H('深入地研究循环', '循环变量会依次引用每个元素。变量名应表达单个元素，如 students 对应 student。'),
        H('在 for 循环中执行更多的操作', '所有保持同一级缩进的语句都属于循环体，每个元素都会执行一次。'),
        C('students = ["Ada", "Lin", "Sam"]\nfor student in students:\n    print(f"欢迎，{student}")\n    print("课程已经准备好。")'),
        H('在 for 循环结束后执行一些操作', '取消缩进后，代码只在整个循环结束后执行一次。'),
        C('students = ["Ada", "Lin", "Sam"]\nfor student in students:\n    print(student)\nprint("全部处理完成")')
      ]),
      L('indentation-errors', '避免缩进错误', 20, '识别循环和代码块中五类常见结构错误。', [
        H('忘记缩进', '冒号后的代码块必须缩进，否则会产生 IndentationError。'),
        H('忘记缩进额外的代码行', '本应重复执行的行如果没有缩进，会意外只执行一次。'),
        H('不必要的缩进', '不属于任何代码块的语句不能随意缩进。'),
        H('循环后不必要的缩进', '循环后的总结语句如果仍缩进，会在每轮重复执行。'),
        H('遗漏了冒号', 'for、if、while、def、class 等复合语句的首行以冒号结束。'),
        C('for number in [1, 2, 3]:\n    print(number)\n\nprint("循环结束")')
      ]),
      L('ranges', '创建数值列表并进行统计', 23, '掌握 range()、list()、统计函数和边界。', [
        H('使用函数 range()', 'range(start, stop, step) 包含起点、不包含终点；step 控制步长。'),
        C('for number in range(2, 10, 2):\n    print(number)'),
        H('使用 range() 创建数字列表', 'range 对象按需生成数字，list() 可以把它转换为实际列表。'),
        C('numbers = list(range(1, 6))\nprint(numbers)'),
        H('对数字列表执行简单的统计计算', 'min()、max() 和 sum() 分别取得最小值、最大值和总和。'),
        C('numbers = list(range(1, 6))\nprint(min(numbers), max(numbers), sum(numbers))')
      ], 'number-window'),
      L('comprehensions', '列表解析', 17, '用一个表达式完成循环、计算和收集。', [
        H('列表解析', '列表解析的结构是 [表达式 for 元素 in 可迭代对象]，还可以添加条件。逻辑复杂时应改用普通循环。'),
        C('squares = [number ** 2 for number in range(1, 6)]\nevens = [number for number in range(10) if number % 2 == 0]\nprint(squares)\nprint(evens)')
      ], 'square-window'),
      L('slices-copy', '使用列表的一部分', 21, '使用切片、遍历切片并创建独立副本。', [
        H('切片', 'items[start:stop:step] 包含 start、不包含 stop；省略边界表示延伸到开头或末尾。'),
        C('items = [0, 1, 2, 3, 4, 5]\nprint(items[1:4])\nprint(items[:3])\nprint(items[::2])'),
        H('遍历切片', '切片产生新列表，因此可以直接在 for 循环中遍历所选部分。'),
        C('items = [0, 1, 2, 3, 4, 5]\nfor item in items[-3:]:\n    print(item)'),
        H('复制列表', 'items[:] 或 items.copy() 创建浅副本；copy = items 只是增加同一列表的别名。'),
        C('items = [0, 1, 2, 3, 4, 5]\ncopy = items[:]\ncopy.append(6)\nprint(items)\nprint(copy)')
      ]),
      L('tuples-style', '元组与代码格式', 22, '表达固定数据，并遵循一致的代码风格。', [
        H('元组', '元组是有顺序的不可变序列，常用于表达不应原地修改的一组值。单元素元组必须带逗号。'),
        H('定义元组', '使用逗号创建元组，圆括号用于增强可读性。'),
        C('dimensions = (1920, 1080)\nsingle = (5,)\nprint(dimensions, single)'),
        H('遍历元组中的所有值', '元组同样是可迭代对象，可以用 for 循环遍历。'),
        C('dimensions = (1920, 1080)\nfor value in dimensions:\n    print(value)'),
        H('修改元组变量', '不能给元组元素赋值，但可以让变量重新绑定到一个新元组。'),
        C('dimensions = (1280, 720)\nprint(dimensions)'),
        H('设置代码格式', '格式不是装饰，它帮助读者快速识别结构并减少缩进错误。'),
        H('格式设置指南', '遵循 PEP 8 等约定，让不同作者的 Python 代码具有一致结构。'),
        H('缩进', '每一级代码块使用四个空格，不混用 Tab。'),
        H('行长', '避免过长行；复杂表达式使用括号进行自然换行。'),
        H('空行', '用空行分隔函数、类和不同逻辑段落，但不要用大量空行打断阅读。'),
        H('其他格式设置指南', '运算符周围保留适当空格，导入通常放在文件开头，命名保持一致。')
      ], 'rectangle-area'),
      L('list-operations-summary', '操作列表小结', 9, '回顾循环、数值序列、切片和元组。', [P('你已经能遍历列表、识别缩进范围、用 range() 创建数字、编写列表解析、复制切片并使用元组表达固定数据。')])
    ]
  },
  {
    id: 'conditionals', number: 5, title: 'if 语句', description: '通过条件测试让程序根据数据选择不同路径。',
    lessons: [
      L('if-first-look', '一个简单示例与条件测试', 18, '从布尔值开始理解程序分支。', [
        H('一个简单示例', 'if 根据条件表达式的 True 或 False 决定是否执行代码块。'),
        C('age = 18\nif age >= 18:\n    print("可以进入")'),
        H('条件测试', '比较、成员检查和逻辑运算都会产生布尔值 True 或 False。'),
        H('检查是否相等', '== 比较值是否相等，= 用于赋值，两者不能混淆。'),
        C('language = "Python"\nprint(language == "Python")'),
        H('检查是否相等时不考虑大小写', '先把两边统一成 lower() 或 casefold()，再比较。'),
        C('answer = "YES"\nprint(answer.lower() == "yes")'),
        H('检查是否不相等', '!= 在两个值不相等时为 True。'),
        C('language = "Python"\nprint(language != "Java")')
      ]),
      L('condition-combinations', '数字、多个条件、成员与布尔表达式', 21, '组合比较并检查列表成员。', [
        H('比较数字', '可以使用 <、<=、>、>=、== 和 !=，也可写连续比较。'),
        C('score = 86\nprint(60 <= score < 90)'),
        H('检查多个条件', 'and 要求两边都为 True；or 只要求至少一边为 True；not 取反。'),
        C('age = 20\nhas_ticket = True\nprint(age >= 18 and has_ticket)'),
        H('检查特定值是否包含在列表中', 'in 检查成员是否存在。'),
        H('检查特定值是否不包含在列表中', 'not in 检查成员不存在。'),
        C('blocked = ["spam", "bot"]\nprint("bot" in blocked)\nprint("Ada" not in blocked)'),
        H('布尔表达式', '布尔表达式的结果是 bool 对象。可以直接保存状态，而不必写 status == True。'),
        C('score = 86\nis_ready = score >= 60\nif is_ready:\n    print("已准备")')
      ]),
      L('if-structures', 'if、if-else 与 if-elif-else', 23, '选择互斥路径并组织多分支逻辑。', [
        H('简单的 if 语句', '条件为 True 时执行代码块，否则直接跳过。'),
        H('if-else 语句', 'else 提供条件为 False 时的备用路径。'),
        C('temperature = 12\nif temperature >= 20:\n    print("温暖")\nelse:\n    print("偏凉")'),
        H('if-elif-else 结构', 'Python 从上到下检查条件，只执行第一个为 True 的分支。'),
        C('score = 86\nif score >= 90:\n    grade = "A"\nelif score >= 80:\n    grade = "B"\nelse:\n    grade = "C"\nprint(grade)'),
        H('使用多个 elif 代码块', '可以继续添加 elif 覆盖更多互斥区间，应把更具体或更严格的条件放在前面。'),
        H('省略 else 代码块', '当所有合法情况都能用明确条件表达时，可以用最后一个 elif 代替宽泛的 else。'),
        H('测试多个条件', '如果多个动作可能同时发生，应使用多个独立 if，而不是互斥的 elif 链。')
      ], 'score-level'),
      L('if-with-lists', '使用 if 语句处理列表', 20, '处理特殊元素、空列表和多个列表。', [
        H('检查特殊元素', '循环中可以对特定元素执行不同操作。'),
        C('items = ["normal", "admin", "guest"]\nfor item in items:\n    if item == "admin":\n        print("管理员权限")\n    else:\n        print(item)'),
        H('确定列表不是空的', '空容器在布尔上下文中为 False，可以直接写 if items。'),
        C('requests = []\nif requests:\n    print("开始处理")\nelse:\n    print("没有请求")'),
        H('使用多个列表', '用成员测试比较可用项和请求项，并分别处理可用与不可用情况。'),
        C('available = ["Python", "Go"]\nrequested = ["Python", "Rust"]\nfor language in requested:\n    if language in available:\n        print(f"提供 {language}")\n    else:\n        print(f"暂不提供 {language}")')
      ]),
      L('if-style', '设置 if 语句的格式', 11, '让复杂条件保持清晰。', [
        H('设置 if 语句的格式', '比较运算符两边保留空格；复杂条件使用有意义的布尔变量或括号换行，避免在一行堆叠太多逻辑。'),
        C('age = 20\nhas_ticket = True\nmeets_age_requirement = age >= 18\ncan_enter = meets_age_requirement and has_ticket\nif can_enter:\n    print("允许进入")')
      ]),
      L('if-summary', 'if 语句小结', 9, '回顾条件测试与分支选择。', [P('你已经能比较值、组合条件、检查成员，并选择简单 if、if-else、elif 链或多个独立 if。')])
    ]
  },
  {
    id: 'dictionaries', number: 6, title: '字典', description: '使用键—值映射表达对象属性，并学习遍历与嵌套。',
    lessons: [
      L('dict-first-look', '一个简单的字典', 13, '理解键—值映射。', [
        H('一个简单的字典', '字典使用花括号保存键—值对。键必须可哈希并且唯一，值可以是任意对象。'),
        C('student = {"name": "Ada", "score": 96}\nprint(student)')
      ]),
      L('dict-use', '使用字典：访问、添加、修改和删除', 24, '完成字典的常用更新操作。', [
        H('访问字典中的值', '使用 [] 按键访问；get() 可以提供键不存在时的默认值。'),
        C('student = {"name": "Ada", "score": 96}\nprint(student["name"])\nprint(student.get("city", "unknown"))'),
        H('添加键—值对', '给新键赋值即可添加。'),
        C('student = {"name": "Ada", "score": 96}\nstudent["city"] = "London"\nprint(student)'),
        H('先创建一个空字典', '可以先创建 {}，再根据程序运行结果逐步填充。'),
        C('profile = {}\nprofile["name"] = "Lin"\nprofile["active"] = True'),
        H('修改字典中的值', '给已有键重新赋值会替换旧值。'),
        C('profile = {"name": "Lin", "active": True}\nprofile["active"] = False\nprint(profile)'),
        H('删除键—值对', 'del 删除指定键；pop() 删除并返回值，还可设置默认值。'),
        C('profile = {"name": "Lin", "active": False}\nremoved = profile.pop("active", None)\nprint(removed, profile)'),
        H('由类似对象组成的字典', '当多条记录共享相同字段，可以使用 ID 或名称作为键，每个值保存一个描述对象的字典。')
      ]),
      L('dict-loop', '遍历字典', 22, '遍历键值对、键和值，并理解顺序。', [
        H('遍历所有的键—值对', 'items() 产生 (key, value) 对，常用两个循环变量解包。'),
        C('scores = {"Ada": 96, "Lin": 88}\nfor name, score in scores.items():\n    print(name, score)'),
        H('遍历字典中的所有键', '直接遍历字典或调用 keys() 都会得到键。'),
        C('scores = {"Ada": 96, "Lin": 88}\nfor name in scores:\n    print(name)'),
        H('按顺序遍历字典中的所有键', '现代 Python 保留插入顺序；若需要排序后的键，应显式使用 sorted(scores)。'),
        C('scores = {"Ada": 96, "Lin": 88}\nfor name in sorted(scores):\n    print(name)'),
        H('遍历字典中的所有值', 'values() 返回值视图。需要去重时可以在值可哈希的前提下使用 set()。'),
        C('scores = {"Ada": 96, "Lin": 88}\nfor score in scores.values():\n    print(score)')
      ], 'inventory-total'),
      L('dict-nesting', '嵌套', 25, '组合字典和列表表达层次化数据。', [
        H('字典列表', '列表中的每个字典可以表示一条结构相似的记录。'),
        C('users = [\n    {"name": "Ada", "active": True},\n    {"name": "Lin", "active": False},\n]\nprint(users[0]["name"])'),
        H('在字典中存储列表', '当一个键对应多个值时，可以把列表作为字典值。'),
        C('course = {"title": "Python", "tags": ["code", "objects"]}\nprint(course["tags"][0])'),
        H('在字典中存储字典', '嵌套字典适合表达按 ID 查找的复杂记录，但层次过深时应考虑类或专门的数据结构。'),
        C('users_by_id = {\n    "u1": {"name": "Ada", "score": 96},\n    "u2": {"name": "Lin", "score": 88},\n}\nprint(users_by_id["u2"]["score"])')
      ]),
      L('dict-summary', '字典小结', 9, '回顾映射、遍历和嵌套。', [P('你已经能创建和更新字典，遍历键值对、键和值，并使用列表与字典的嵌套表达实际数据。')])
    ]
  },
  {
    id: 'input-while', number: 7, title: '用户输入和 while 循环', description: '读取输入、控制重复执行，并用循环更新列表与字典。',
    lessons: [
      L('input-basics', '函数 input() 的工作原理', 22, '读取文本输入并进行数值转换。', [
        H('函数 input() 的工作原理', 'input(prompt) 显示提示并暂停程序，用户确认后返回字符串。在线自动评测题通常通过函数参数接收数据，不直接调用 input()。'),
        C('# 在完整 JupyterLab 中取消注释体验交互输入\n# name = input("请输入名字：")\n# print(f"Hello, {name}")\nprint("input() 的返回类型是 str")'),
        H('编写清晰的程序', '提示语应说明需要输入什么以及合法格式。较长提示可以先保存在变量中。'),
        H('使用 int() 来获取数值输入', 'input() 总是返回字符串。需要数值计算时使用 int() 或 float()，并考虑无效输入。'),
        C('text = "42"\nnumber = int(text)\nprint(number + 8)'),
        H('求模运算符', '% 返回除法余数，常用于判断奇偶或周期。'),
        C('number = 17\nprint(number % 2)'),
        H('在 Python 2.7 中获取输入', 'Python 2 的 raw_input() 类似 Python 3 的 input()；Python 2 的 input() 会求值输入，存在风险。本课程只使用 Python 3。')
      ]),
      L('while-basics', 'while 循环简介与退出控制', 24, '根据条件重复执行，并安全终止循环。', [
        H('while 循环简介', 'while 在条件保持 True 时重复执行代码块，适合无法预先确定次数的任务。'),
        H('使用 while 循环', '循环体必须改变条件相关状态，否则可能永远运行。'),
        C('current = 1\nwhile current <= 5:\n    print(current)\n    current += 1'),
        H('让用户选择何时退出', '可以约定退出词，并在每轮读取新输入。'),
        H('使用标志', '用布尔变量记录程序是否继续运行，适合多个条件都可能结束循环。'),
        C('active = True\nsteps = 0\nwhile active:\n    steps += 1\n    if steps >= 3:\n        active = False\nprint(steps)'),
        H('使用 break 退出循环', 'break 立即结束当前最内层循环。'),
        H('在循环中使用 continue', 'continue 跳过本轮剩余代码，回到下一次条件检查。'),
        C('number = 0\nwhile number < 6:\n    number += 1\n    if number % 2 == 0:\n        continue\n    print(number)'),
        H('避免无限循环', '确认条件最终会变为 False；调试时加入计数上限，并知道如何停止运行中的内核。')
      ]),
      L('while-collections', '使用 while 循环处理列表和字典', 23, '移动、删除和收集数据。', [
        H('使用 while 循环来处理列表和字典', 'while 适合在容器仍有待处理元素时持续移动、删除或收集数据。'),
        H('在列表之间移动元素', 'while source 配合 pop() 可以逐个取出元素并放入另一个列表。'),
        C('pending = ["a", "b", "c"]\ncompleted = []\nwhile pending:\n    completed.append(pending.pop())\nprint(completed)'),
        H('删除包含特定值的所有列表元素', 'remove() 每次只删除第一个匹配项，因此可用 while value in items 重复删除。'),
        C('pets = ["cat", "dog", "cat", "bird"]\nwhile "cat" in pets:\n    pets.remove("cat")\nprint(pets)'),
        H('使用用户输入来填充字典', '循环可持续收集键和值，直到用户选择结束。实际程序要验证空键、重复键和输入类型。'),
        C('responses = {}\nsample_inputs = [("Ada", "Python"), ("Lin", "Go")]\nfor name, language in sample_inputs:\n    responses[name] = language\nprint(responses)')
      ], 'remove-all'),
      L('input-while-summary', '用户输入和 while 循环小结', 9, '回顾输入转换、循环控制和容器更新。', [P('你已经理解 input() 返回字符串，能用 int() 转换数值，并能通过条件、标志、break 和 continue 控制 while 循环。')])
    ]
  },
  {
    id: 'functions', number: 8, title: '函数', description: '封装可复用行为，掌握参数、返回值、列表、任意参数和模块。',
    lessons: [
      L('function-definition', '定义函数并传递信息', 19, '区分函数、形参和实参。', [
        H('定义函数', 'def 创建函数对象，函数名绑定到它；缩进代码组成函数体。文档字符串可以说明用途。'),
        C('def greet():\n    """返回一条欢迎语。"""\n    return "Hello"\n\nprint(greet())'),
        H('向函数传递信息', '在括号中声明形参，调用时提供实参。'),
        C('def greet(name):\n    return f"Hello, {name}"\n\nprint(greet("Ada"))'),
        H('实参和形参', '形参是函数定义中的名称，实参是调用时传入的对象。调用发生时，形参绑定到对应实参。')
      ]),
      L('function-arguments', '传递实参', 23, '掌握位置、关键字、默认值和调用错误。', [
        H('位置实参', '按定义顺序匹配，顺序错误会产生语义错误。'),
        H('关键字实参', '使用 name=value 按名称匹配，可提高可读性并改变书写顺序。'),
        C('def describe(name, language):\n    return f"{name}: {language}"\n\nprint(describe("Ada", "Python"))\nprint(describe(language="Python", name="Ada"))'),
        H('默认值', '带默认值的形参通常放在无默认值形参之后；调用时省略即可使用默认对象。'),
        C('def describe(name, language="Python"):\n    return f"{name}: {language}"\n\nprint(describe("Lin"))'),
        H('等效的函数调用', '位置和关键字形式可能产生相同结果，但关键字调用更能表达参数含义。'),
        H('避免实参错误', '缺少、过多、重复或未知实参会产生 TypeError。先检查函数签名和调用位置。')
      ]),
      L('function-return', '返回值', 23, '返回简单值、可选实参和字典。', [
        H('返回值', 'return 立即结束函数并把对象交给调用方；没有执行 return 时返回 None。'),
        H('返回简单值', '函数可以计算并返回字符串、数字或其他对象。'),
        C('def full_name(first, last):\n    return f"{first} {last}".title()\n\nprint(full_name("ada", "lovelace"))'),
        H('让实参变成可选的', '可使用默认值 None 表示未提供，再在函数内决定是否处理。'),
        C('def full_name(first, last, middle=None):\n    if middle:\n        return f"{first} {middle} {last}"\n    return f"{first} {last}"'),
        H('返回字典', '函数可以返回结构化数据，调用方再按键使用。'),
        C('def build_user(name, active=True):\n    return {"name": name, "active": active}\n\nprint(build_user("Ada"))'),
        H('结合使用函数和 while 循环', 'while 可以反复收集数据，每轮调用函数处理；把计算逻辑放入函数能让循环更清楚。')
      ], 'build-profile'),
      L('function-lists', '传递列表', 18, '理解函数内修改列表以及如何保护输入。', [
        H('传递列表', '传入列表时，形参和调用方变量会引用同一个列表对象。'),
        H('在函数中修改列表', 'append()、pop() 等原地操作会被调用方观察到。'),
        C('def add_done(tasks):\n    tasks.append("done")\n\nitems = ["read"]\nadd_done(items)\nprint(items)'),
        H('禁止函数修改列表', '传入切片 items[:] 或 copy() 可以让函数修改浅副本；更好的方式是让函数明确返回新列表。'),
        C('def with_done(tasks):\n    result = tasks.copy()\n    result.append("done")\n    return result')
      ]),
      L('function-varargs', '传递任意数量的实参', 21, '使用 *args 和 **kwargs 设计灵活接口。', [
        H('传递任意数量的实参', '*args 把多余位置实参收集为元组。'),
        C('def total(*numbers):\n    return sum(numbers)\n\nprint(total(1, 2, 3, 4))'),
        H('结合使用位置实参和任意数量实参', '固定形参放在 *args 之前，用于必需信息。'),
        C('def label(prefix, *values):\n    return [f"{prefix}:{value}" for value in values]'),
        H('使用任意数量的关键字实参', '**kwargs 把额外关键字实参收集为字典。'),
        C('def build_profile(name, **details):\n    return {"name": name, **details}\n\nprint(build_profile("Ada", role="admin", active=True))')
      ]),
      L('function-modules', '将函数存储在模块中', 24, '组织跨文件代码并理解多种导入方式。', [
        H('将函数存储在模块中', '一个 .py 文件就是模块。把相关函数放入模块，可以在其他文件中复用。'),
        H('导入整个模块', 'import module 后使用 module.function()，来源最清楚。'),
        C('import math\nprint(math.sqrt(81))'),
        H('导入特定的函数', 'from module import function 可直接使用函数名，但要注意名称冲突。'),
        C('from math import ceil\nprint(ceil(3.2))'),
        H('使用 as 给函数指定别名', 'from module import function as alias。'),
        C('from math import factorial as fact\nprint(fact(5))'),
        H('使用 as 给模块指定别名', 'import module as alias，常用于社区约定或缩短长模块名。'),
        C('import statistics as stats\nprint(stats.mean([2, 4, 6]))'),
        H('导入模块中的所有函数', 'from module import * 会污染命名空间并隐藏来源，除交互探索外通常不推荐。')
      ]),
      L('function-style', '函数编写指南', 13, '设计短小、清晰、职责单一的函数。', [
        H('函数编写指南', '函数名使用小写下划线；写清楚文档字符串；每个函数聚焦一项职责；避免依赖隐式全局状态；参数过多时考虑重构数据结构。'),
        C('def rectangle_area(width: float, height: float) -> float:\n    """返回矩形面积。"""\n    return width * height')
      ]),
      L('functions-summary', '函数小结', 9, '回顾定义、参数、返回值和模块。', [P('你已经能定义函数，使用多种实参方式，返回不同对象，控制列表是否被修改，处理任意参数，并把函数组织到模块中。')])
    ]
  },
  {
    id: 'classes', number: 9, title: '类', description: '系统学习类、实例、属性、方法、继承、组合和模块化。',
    lessons: [
      L('class-create', '创建和使用类', 24, '从 Dog 类理解 __init__、self 与实例方法。', [
        H('创建和使用类', '类把相关状态和行为组织在一起。类名通常使用 CapWords 风格。'),
        H('创建 Dog 类', '__init__() 在创建实例时初始化属性；self 引用当前实例。'),
        C('class Dog:\n    def __init__(self, name, age):\n        self.name = name\n        self.age = age\n\n    def sit(self):\n        return f"{self.name} is sitting"'),
        H('根据类创建实例', '调用类会创建实例，再通过点号访问属性和方法。每个实例保存自己的状态。'),
        C('class Dog:\n    def __init__(self, name, age):\n        self.name = name\n        self.age = age\n\n    def sit(self):\n        return f"{self.name} is sitting"\n\nwillie = Dog("Willie", 6)\nlucy = Dog("Lucy", 3)\nprint(willie.name, willie.sit())\nprint(lucy.name)')
      ]),
      L('class-instance-use', '使用类和实例', 21, '设置默认属性并通过不同方式修改状态。', [
        H('使用类和实例', '实例方法可以读取或更新 self 上的属性，调用方不需要手动传入 self。'),
        H('Car 类', '用类表达车辆的制造商、型号、年份和里程等相关数据。'),
        H('给属性指定默认值', '可以在 __init__ 中直接设置默认状态，也可以使用带默认值的形参。'),
        C('class Car:\n    def __init__(self, make, model, year):\n        self.make = make\n        self.model = model\n        self.year = year\n        self.odometer = 0'),
        H('修改属性的值', '可以直接赋值、通过方法设置，或通过方法按增量更新。方法可以验证新值，通常比直接修改更安全。'),
        C('class Car:\n    def __init__(self):\n        self.odometer = 0\n\n    def update_odometer(self, value):\n        if value >= self.odometer:\n            self.odometer = value\n\ncar = Car()\ncar.update_odometer(120)\nprint(car.odometer)')
      ]),
      L('class-inheritance', '继承', 27, '复用父类行为并为子类添加或重写能力。', [
        H('继承', '子类自动获得父类的属性和方法，并可以添加专有行为。继承表达“是一种”的关系。'),
        H('子类的方法 __init__()', '使用 super().__init__() 调用父类初始化逻辑。'),
        C('class Car:\n    def __init__(self, make, model, year):\n        self.make = make\n        self.model = model\n        self.year = year\n\nclass ElectricCar(Car):\n    def __init__(self, make, model, year):\n        super().__init__(make, model, year)\n        self.battery_size = 75\n\ncar = ElectricCar("Tesla", "Model 3", 2026)\nprint(car.model, car.battery_size)'),
        H('Python 2.7 中的继承', 'Python 2 曾常见 super(ClassName, self) 和显式继承 object。Python 3 可使用简洁的 super()，所有类都是新式类。'),
        H('给子类定义属性和方法', '子类可添加只属于自己的状态与行为。'),
        H('重写父类的方法', '在子类定义同名方法即可替换继承行为，但应保持清晰的接口约定。'),
        C('class Car:\n    def fill_gas_tank(self):\n        return "正在加油"\n\nclass ElectricCar(Car):\n    def fill_gas_tank(self):\n        return "电动车没有油箱"\n\nprint(ElectricCar().fill_gas_tank())')
      ]),
      L('class-composition', '将实例用作属性并模拟实物', 20, '用组合拆分职责，避免类无限膨胀。', [
        H('将实例用作属性', '当一部分功能可以独立负责时，把另一个类的实例保存为属性，这叫组合，表达“拥有一个”的关系。'),
        C('class Battery:\n    def __init__(self, size=75):\n        self.size = size\n\n    def range_km(self):\n        return self.size * 5\n\nclass ElectricCar:\n    def __init__(self):\n        self.battery = Battery()\n\ncar = ElectricCar()\nprint(car.battery.range_km())'),
        H('模拟实物', '模型只应包含当前程序需要的细节。随着需求变化，持续调整类的职责、属性和协作方式。')
      ], 'car-label'),
      L('class-imports', '导入类', 24, '把类放入模块并选择清楚的导入方式。', [
        H('导入单个类', 'from module import ClassName。'),
        H('在一个模块中存储多个类', '关系紧密的小型类可放在同一模块；模块过大时再按职责拆分。'),
        H('从一个模块中导入多个类', 'from module import ClassA, ClassB。'),
        H('导入整个模块', 'import module 后使用 module.ClassName，来源清晰。'),
        H('导入模块中的所有类', 'from module import * 容易造成名称冲突，一般不推荐。'),
        H('在一个模块中导入另一个模块', '模块之间可以导入依赖类，但要注意循环导入。'),
        H('自定义工作流程', '先保持结构简单；当文件职责变得混乱时再拆分，并让导入方向尽量单向。'),
        C('from dataclasses import dataclass\n\n@dataclass\nclass Point:\n    x: int\n    y: int\n\nprint(Point(2, 3))')
      ]),
      L('class-library-style', 'Python 标准库与类编码风格', 18, '使用标准库并写出易读的类。', [
        H('Python 标准库', '标准库随 Python 提供，包含 pathlib、datetime、random、collections、unittest 等模块。使用前仍需阅读当前版本文档。'),
        C('from collections import OrderedDict\nfrom pathlib import Path\nprint(Path("notes.txt").suffix)'),
        H('类编码风格', '类名使用 CapWords；实例和模块名使用小写下划线；类定义前后留空行；重要类写文档字符串；优先使用清晰组合，不为复用而滥用继承。')
      ]),
      L('classes-summary', '类小结', 9, '回顾实例、继承、组合和模块化。', [P('你已经能创建类与实例，管理属性和方法，使用继承扩展行为、用组合拆分职责，并把类组织到模块中。')])
    ]
  },
  {
    id: 'files-exceptions', number: 10, title: '文件和异常', description: '读取与写入文件，处理错误，并使用 JSON 保存用户数据。',
    lessons: [
      L('file-reading', '从文件中读取数据', 28, '掌握完整读取、路径、逐行处理和大型文件。', [
        H('从文件中读取数据', '现代 Python 推荐使用 with 和 pathlib.Path，让文件在使用后可靠关闭。课程容器只能访问当前账号的工作目录。'),
        H('读取整个文件', 'Path.read_text() 返回整个文本；open() 配合 read() 也可以完成。'),
        C('from pathlib import Path\npath = Path("sample.txt")\npath.write_text("first\\nsecond\\n", encoding="utf-8")\nprint(path.read_text(encoding="utf-8"))'),
        H('文件路径', '相对路径基于当前工作目录；绝对路径从文件系统根开始。使用 Path 拼接路径比手写分隔符更可移植。'),
        C('from pathlib import Path\nfolder = Path("notes")\nfile_path = folder / "today.txt"\nprint(file_path)'),
        H('逐行读取', '可以直接遍历文件对象，适合不一次加载全部内容。'),
        H('创建一个包含文件各行内容的列表', 'readlines() 或 splitlines() 得到行列表；注意是否保留换行符。'),
        C('from pathlib import Path\npath = Path("sample.txt")\npath.write_text("first\\nsecond\\n", encoding="utf-8")\nlines = path.read_text(encoding="utf-8").splitlines()\nprint(lines)'),
        H('使用文件的内容', '读到的内容是字符串，应根据需求 strip()、分割或转换为数值。'),
        H('包含一百万位的大型文件', '大型文件应流式逐行处理，避免一次读入造成不必要内存占用。'),
        H('圆周率值中包含你的生日吗', '可以把生日转成纯数字字符串，再使用 in 检查是否出现在圆周率数字文本中；这也是字符串搜索的实际例子。')
      ]),
      L('file-writing', '写入文件', 20, '创建、覆盖、多行写入和追加内容。', [
        H('写入文件', '写入前确认路径和编码。with open(...) 会在代码块结束时关闭文件。'),
        H('写入空文件', '使用模式 "w" 打开会创建文件或清空已有内容。'),
        C('from pathlib import Path\npath = Path("output.txt")\npath.write_text("", encoding="utf-8")'),
        H('写入多行', '每行末尾需要显式添加 \\n，或把字符串列表用 join() 组合。'),
        C('from pathlib import Path\npath = Path("output.txt")\nlines = ["Ada", "Lin", "Grace"]\npath.write_text("\\n".join(lines) + "\\n", encoding="utf-8")\nprint(path.read_text(encoding="utf-8"))'),
        H('附加到文件', '模式 "a" 在末尾写入，不清空原内容。'),
        C('from pathlib import Path\npath = Path("output.txt")\npath.write_text("Ada\\n", encoding="utf-8")\nwith path.open("a", encoding="utf-8") as file:\n    file.write("Guido\\n")\nprint(path.read_text(encoding="utf-8"))')
      ]),
      L('exceptions', '异常', 29, '捕获可预期错误并决定如何报告。', [
        H('异常', '异常是运行期间表示错误或特殊情况的对象。未处理异常会沿调用栈传播并终止当前任务。'),
        H('处理 ZeroDivisionError 异常', '除数为零会引发 ZeroDivisionError。'),
        H('使用 try-except 代码块', '把可能失败的最小代码放在 try 中，只捕获能够合理处理的具体异常。'),
        C('try:\n    result = 10 / 0\nexcept ZeroDivisionError:\n    result = None\nprint(result)'),
        H('使用异常避免崩溃', '捕获异常后可提示用户、记录信息、采用备用值或跳过当前记录。'),
        H('else 代码块', 'try 成功时执行 else，能避免把不会抛出该异常的代码也放入 try。'),
        C('try:\n    number = int("42")\nexcept ValueError:\n    print("不是整数")\nelse:\n    print(number * 2)'),
        H('处理 FileNotFoundError 异常', '文件不存在时可提示路径、创建默认文件或跳过，但不应把所有错误都误报成“文件不存在”。'),
        H('分析文本', '读取后可用 split() 拆分单词并统计长度或频率。'),
        H('使用多个文件', '把单文件处理封装为函数，再循环调用；某个文件失败时决定继续还是终止。'),
        H('失败时一声不吭', 'except Error: pass 会隐藏问题，只适合明确允许忽略的情况；通常至少应留下日志或计数。'),
        H('决定报告哪些错误', '面向用户报告可操作的信息，面向开发者保留技术细节；不要暴露敏感路径或机密数据。')
      ], 'safe-divide'),
      L('json-storage', '存储数据与重构', 24, '使用 JSON 保存简单数据，并拆分重复逻辑。', [
        H('存储数据', '文本文件适合人类阅读；JSON 适合保存由字典、列表、字符串、数字、布尔值和 null 组成的数据。'),
        H('使用 json.dump() 和 json.load()', 'dump() 写入文件对象，load() 从文件对象读取。也可使用 dumps() 和 loads() 处理字符串。'),
        C('import json\nfrom pathlib import Path\npath = Path("profile.json")\ndata = {"name": "Ada", "score": 96}\npath.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")\nloaded = json.loads(path.read_text(encoding="utf-8"))\nprint(loaded)'),
        H('保存和读取用户生成的数据', '启动时尝试读取已有数据，不存在时收集或创建默认数据；写入时考虑验证和备份。'),
        H('重构', '在功能保持不变的前提下改善结构。把读取、写入、验证和显示拆成职责清楚的函数，减少重复。')
      ]),
      L('files-summary', '文件和异常小结', 9, '回顾持久化、错误处理和重构。', [P('你已经能读取和写入文本文件，处理常见异常，决定错误报告策略，并使用 JSON 保存结构化数据。')])
    ]
  },
  {
    id: 'testing', number: 11, title: '测试代码', description: '为函数和类编写自动化测试，让修改变得可验证。',
    lessons: [
      L('test-functions', '测试函数', 28, '理解单元测试、测试用例、失败分析和新增测试。', [
        H('测试函数', '测试用固定输入调用函数，并断言结果符合预期。测试应快速、独立、可重复。'),
        H('单元测试和测试用例', '单元测试关注一个小单元；测试用例是一组相关测试方法。Python 标准库提供 unittest，也可以学习 pytest。'),
        C('import unittest\n\ndef full_name(first, last):\n    return f"{first} {last}".title()\n\nclass NameTest(unittest.TestCase):\n    def test_first_last(self):\n        self.assertEqual(full_name("ada", "lovelace"), "Ada Lovelace")'),
        H('可通过的测试', '当实际结果满足断言时测试通过，为当前行为提供一条可重复证据。'),
        H('不能通过的测试', '失败报告会显示预期与实际差异；错误则表示测试执行过程中出现异常。'),
        H('测试未通过时怎么办', '先确认需求，再判断实现还是测试需要修正。不要只为“变绿”而删除有价值的断言。'),
        H('添加新测试', '为正常情况、边界、空输入和曾经出现的缺陷增加测试，避免同一问题再次发生。')
      ], 'normalize-username'),
      L('test-classes', '测试类', 29, '使用断言和 setUp() 验证对象行为。', [
        H('测试类', '测试类时创建实例、调用方法，再检查属性或返回值。每个测试应关注清楚的行为。'),
        H('各种断言方法', 'unittest 提供 assertEqual、assertTrue、assertIn、assertRaises 等方法。选择最能表达意图的断言。'),
        C('import unittest\n\nclass Counter:\n    def __init__(self):\n        self.value = 0\n    def increment(self):\n        self.value += 1\n\nclass CounterTest(unittest.TestCase):\n    def test_increment(self):\n        counter = Counter()\n        counter.increment()\n        self.assertEqual(counter.value, 1)\n\nsuite = unittest.defaultTestLoader.loadTestsFromTestCase(CounterTest)\nunittest.TextTestRunner().run(suite)'),
        H('一个要测试的类', '选择具有明确状态变化和结果的类，并列出应保证的行为。'),
        H('测试 AnonymousSurvey 类', '问卷类可以收集回答；测试应验证单个回答和多个回答都被正确保存。重点是测试公开行为，而不是依赖内部实现细节。'),
        H('方法 setUp()', 'setUp() 在每个测试方法前运行，用于创建重复使用的实例和数据；每个测试仍得到新的初始环境。'),
        C('import unittest\n\nclass SurveyTest(unittest.TestCase):\n    def setUp(self):\n        self.responses = []\n\n    def test_store_response(self):\n        self.responses.append("Python")\n        self.assertIn("Python", self.responses)\n\nsuite = unittest.defaultTestLoader.loadTestsFromTestCase(SurveyTest)\nunittest.TextTestRunner().run(suite)')
      ]),
      L('testing-summary', '测试代码小结', 11, '把测试变成开发反馈循环。', [
        H('小结', '优秀测试关注可观察行为，覆盖正常与边界情况，失败时提供清楚线索。先运行测试，再修改代码，修改后再次运行。'),
        C('def is_even(number):\n    return number % 2 == 0\n\nassert is_even(2)\nassert not is_even(3)\nprint("tests passed")'),
        T('课程作业的“测试”按钮正是在做相同的事：使用输入调用你的 Solution 方法，并比较实际返回值与期望返回值。')
      ])
    ]
  }
];

const assignments = {
  'hello-function': {
    id: 'hello-function', title: '作业：生成欢迎语', prompt: '在 Solution 类中编写 hello_world(name)，返回格式完全为 Hello, 名字! 的字符串。', functionName: 'hello_world',
    starterCode: 'class Solution:\n    def hello_world(self, name: str) -> str:\n        pass\n', examples: [{ call: 'Solution().hello_world("Ada")', output: '"Hello, Ada!"', explanation: '使用传入名字生成字符串并 return。' }],
    makeCases: () => randomNames(6).map(name => ({ args: [name], expected: `Hello, ${name}!` }))
  },
  'profile-line': {
    id: 'profile-line', title: '作业：组合用户信息', prompt: '编写 profile_line(name, age)，返回“名字今年age岁。”。', functionName: 'profile_line', starterCode: 'class Solution:\n    def profile_line(self, name: str, age: int) -> str:\n        pass\n',
    examples: [{ call: 'Solution().profile_line("Lin", 18)', output: '"Lin今年18岁。"', explanation: '可以使用 f-string。' }],
    makeCases: () => randomNames(5).map(name => { const age = crypto.randomInt(8, 81); return { args: [name, age], expected: `${name}今年${age}岁。` }; })
  },
  'clean-name': {
    id: 'clean-name', title: '作业：清理姓名', prompt: '编写 clean_name(raw_name)，删除多余空白并将每个单词转为标题格式。', functionName: 'clean_name', starterCode: 'class Solution:\n    def clean_name(self, raw_name: str) -> str:\n        pass\n',
    examples: [{ call: 'Solution().clean_name("  ada lovelace  ")', output: '"Ada Lovelace"', explanation: '处理两端以及单词之间的重复空白。' }],
    makeCases: () => ['  ada lovelace ', '\tgrace hopper\n', '  guido   VAN rossum  ', 'lin'].map(value => ({ args: [value], expected: value.trim().replace(/\s+/g, ' ').split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ') }))
  },
  'sorted-copy': {
    id: 'sorted-copy', title: '作业：安全排序', prompt: '编写 sorted_copy(names)，返回升序新列表，不能修改传入列表。', functionName: 'sorted_copy', preserveArgs: true, starterCode: 'class Solution:\n    def sorted_copy(self, names: List[str]) -> List[str]:\n        pass\n',
    examples: [{ call: 'Solution().sorted_copy(["Lin", "Ada", "Guido"])', output: '["Ada", "Guido", "Lin"]', explanation: '返回新列表并保留原输入顺序。' }],
    makeCases: () => Array.from({ length: 6 }, () => { const values = shuffled(randomNames(crypto.randomInt(3, 7))); return { args: [values], expected: [...values].sort() }; })
  },
  'number-window': {
    id: 'number-window', title: '作业：创建数字区间', prompt: '编写 number_window(start, stop)，返回 [start, stop) 的整数列表。', functionName: 'number_window', starterCode: 'class Solution:\n    def number_window(self, start: int, stop: int) -> List[int]:\n        pass\n',
    examples: [{ call: 'Solution().number_window(2, 6)', output: '[2, 3, 4, 5]', explanation: '包含 start，不包含 stop。' }],
    makeCases: () => Array.from({ length: 7 }, () => { const start = crypto.randomInt(-12, 15), stop = start + crypto.randomInt(1, 10); return { args: [start, stop], expected: Array.from({ length: stop - start }, (_, index) => start + index) }; })
  },
  'square-window': {
    id: 'square-window', title: '作业：平方列表', prompt: '编写 square_window(start, stop)，返回区间内每个整数的平方。', functionName: 'square_window', starterCode: 'class Solution:\n    def square_window(self, start: int, stop: int) -> List[int]:\n        pass\n',
    examples: [{ call: 'Solution().square_window(1, 5)', output: '[1, 4, 9, 16]', explanation: '适合使用列表解析。' }],
    makeCases: () => Array.from({ length: 7 }, () => { const start = crypto.randomInt(-8, 8), stop = start + crypto.randomInt(1, 9); return { args: [start, stop], expected: Array.from({ length: stop - start }, (_, index) => (start + index) ** 2) }; })
  },
  'rectangle-area': {
    id: 'rectangle-area', title: '作业：矩形面积', prompt: '编写 rectangle_area(dimensions)，从二元素列表中取得宽和高并返回面积。', functionName: 'rectangle_area', starterCode: 'class Solution:\n    def rectangle_area(self, dimensions: List[int]) -> int:\n        pass\n',
    examples: [{ call: 'Solution().rectangle_area([8, 5])', output: '40', explanation: '返回宽乘高。' }],
    makeCases: () => Array.from({ length: 6 }, () => { const width = crypto.randomInt(1, 101), height = crypto.randomInt(1, 101); return { args: [[width, height]], expected: width * height }; })
  },
  'object-description': {
    id: 'object-description', title: '作业：对象信息', prompt: '编写 describe_object(value)，返回“类型名:值”的字符串，例如 str:Python。', functionName: 'describe_object', starterCode: 'class Solution:\n    def describe_object(self, value) -> str:\n        pass\n',
    examples: [{ call: 'Solution().describe_object("Python")', output: '"str:Python"', explanation: '使用 type(value).__name__ 取得类型名。' }],
    makeCases: () => [['Python', 'str:Python'], [42, 'int:42'], [true, 'bool:True'], [3.5, 'float:3.5'], [[1, 2], 'list:[1, 2]']].map(([value, expected]) => ({ args: [value], expected }))
  },
  'car-label': {
    id: 'car-label', title: '作业：实例状态描述', prompt: '编写 car_label(make, model, year)，返回“year make model”格式的字符串。把 Solution 当作一个负责生成描述的对象。', functionName: 'car_label', starterCode: 'class Solution:\n    def car_label(self, make: str, model: str, year: int) -> str:\n        pass\n',
    examples: [{ call: 'Solution().car_label("Tesla", "Model 3", 2026)', output: '"2026 Tesla Model 3"', explanation: '实例方法使用 self，并根据参数返回对象描述。' }],
    makeCases: () => Array.from({ length: 6 }, () => { const make = shuffled(['Tesla', 'Ford', 'Toyota', 'Volvo'])[0], model = shuffled(['Model 3', 'Focus', 'Corolla', 'XC40'])[0], year = crypto.randomInt(1990, 2031); return { args: [make, model, year], expected: `${year} ${make} ${model}` }; })
  },
  'score-level': {
    id: 'score-level', title: '作业：成绩等级', prompt: '编写 score_level(score)：90 及以上返回 A，80–89 返回 B，60–79 返回 C，其余返回 D。', functionName: 'score_level', starterCode: 'class Solution:\n    def score_level(self, score: int) -> str:\n        pass\n',
    examples: [{ call: 'Solution().score_level(86)', output: '"B"', explanation: '按从高到低的顺序判断。' }],
    makeCases: () => Array.from({ length: 10 }, () => { const score = crypto.randomInt(0, 101); return { args: [score], expected: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : 'D' }; })
  },
  'inventory-total': {
    id: 'inventory-total', title: '作业：库存总数', prompt: '编写 inventory_total(inventory)，返回字典中所有库存数量的总和。', functionName: 'inventory_total', starterCode: 'class Solution:\n    def inventory_total(self, inventory: dict) -> int:\n        pass\n',
    examples: [{ call: 'Solution().inventory_total({"book": 3, "pen": 5})', output: '8', explanation: '遍历 values() 或使用 sum()。' }],
    makeCases: () => Array.from({ length: 7 }, () => { const data = { book: crypto.randomInt(0, 20), pen: crypto.randomInt(0, 20), note: crypto.randomInt(0, 20) }; return { args: [data], expected: Object.values(data).reduce((sum, value) => sum + value, 0) }; })
  },
  'remove-all': {
    id: 'remove-all', title: '作业：删除全部指定值', prompt: '编写 remove_all(items, target)，返回删除全部 target 后的新列表，不修改输入列表。', functionName: 'remove_all', preserveArgs: true, starterCode: 'class Solution:\n    def remove_all(self, items: List[int], target: int) -> List[int]:\n        pass\n',
    examples: [{ call: 'Solution().remove_all([1, 2, 1, 3], 1)', output: '[2, 3]', explanation: '所有匹配项都要删除。' }],
    makeCases: () => Array.from({ length: 7 }, () => { const target = crypto.randomInt(0, 5), items = Array.from({ length: crypto.randomInt(4, 12) }, () => crypto.randomInt(0, 5)); return { args: [items, target], expected: items.filter(value => value !== target) }; })
  },
  'build-profile': {
    id: 'build-profile', title: '作业：构建资料字典', prompt: '编写 build_profile(name, age, city)，返回包含这三个键的字典。', functionName: 'build_profile', starterCode: 'class Solution:\n    def build_profile(self, name: str, age: int, city: str) -> dict:\n        pass\n',
    examples: [{ call: 'Solution().build_profile("Ada", 18, "London")', output: '{"name": "Ada", "age": 18, "city": "London"}', explanation: '返回结构化字典。' }],
    makeCases: () => randomNames(6).map(name => { const age = crypto.randomInt(8, 81), city = shuffled(['London', 'Toronto', 'Tokyo', 'Paris'])[0]; return { args: [name, age, city], expected: { name, age, city } }; })
  },
  'safe-divide': {
    id: 'safe-divide', title: '作业：安全除法', prompt: '编写 safe_divide(a, b)，正常时返回 a / b，b 为 0 时返回 None。', functionName: 'safe_divide', starterCode: 'class Solution:\n    def safe_divide(self, a: float, b: float):\n        pass\n',
    examples: [{ call: 'Solution().safe_divide(10, 0)', output: 'None', explanation: '捕获 ZeroDivisionError 或预先判断。' }],
    makeCases: () => Array.from({ length: 8 }, (_, index) => { const a = crypto.randomInt(-100, 101), b = index % 3 === 0 ? 0 : crypto.randomInt(1, 21); return { args: [a, b], expected: b === 0 ? null : a / b }; })
  },
  'normalize-username': {
    id: 'normalize-username', title: '作业：规范用户名', prompt: '编写 normalize_username(raw)，删除两端空白、转成小写，并把内部空格替换为下划线。', functionName: 'normalize_username', starterCode: 'class Solution:\n    def normalize_username(self, raw: str) -> str:\n        pass\n',
    examples: [{ call: 'Solution().normalize_username("  Ada Lovelace ")', output: '"ada_lovelace"', explanation: '这道题适合用多个测试覆盖空白与大小写。' }],
    makeCases: () => [['  Ada Lovelace ', 'ada_lovelace'], ['GRACE HOPPER', 'grace_hopper'], [' lin ', 'lin'], ['Python Student', 'python_student'], ['  multiple   spaces ', 'multiple_spaces']].map(([value, expected]) => ({ args: [value], expected }))
  }
};

function randomNames(count) {
  return shuffled(['Ada', 'Grace', 'Lin', 'Guido', 'Sam', 'Maya', 'Noah', 'Iris', 'Kai', 'Zoe']).slice(0, count);
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = crypto.randomInt(0, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function publicAssignment(assignment) {
  if (!assignment) return null;
  return { id: assignment.id, title: assignment.title, prompt: assignment.prompt, functionName: assignment.functionName, starterCode: assignment.starterCode, examples: assignment.examples || [] };
}

function publicCourse() {
  return {
    id: 'python-foundations-v1', title: 'Python：从对象思维到工程实践',
    chapters: chapters.map(chapter => ({ ...chapter, lessons: chapter.lessons.map(lesson => ({ ...lesson, assignment: lesson.assignmentId ? publicAssignment(assignments[lesson.assignmentId]) : null })) }))
  };
}

function getAssignment(id) { return assignments[id] || null; }
function makeEvaluation(assignment) { return { className: 'Solution', functionName: assignment.functionName, preserveArgs: Boolean(assignment.preserveArgs), cases: assignment.makeCases() }; }
function makeVisibleEvaluation(assignment) { const evaluation = makeEvaluation(assignment); evaluation.cases = evaluation.cases.slice(0, 3); evaluation.revealCaseResults = true; return evaluation; }

module.exports = { publicCourse, getAssignment, makeEvaluation, makeVisibleEvaluation };
