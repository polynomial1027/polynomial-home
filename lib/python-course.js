const crypto = require('node:crypto');

const chapters = [
  {
    id: 'foundations',
    number: 1,
    title: 'Python 基础元素',
    description: '从第一个程序开始，掌握变量、字符串、数字、注释与可读代码。',
    lessons: [
      {
        id: 'hello-world', title: '运行第一个 Python 程序', duration: 12,
        summary: '理解 hello_world.py 从源代码到输出所经历的过程。',
        body: [
          { type: 'p', text: 'Python 解释器按照从上到下的顺序读取源文件。遇到 print() 时，它先计算括号里的表达式，再把结果写入标准输出。文件扩展名 .py 表示这是 Python 源代码。' },
          { type: 'code', code: 'message = "Hello, world!"\nprint(message)' },
          { type: 'tip', text: '运行程序前先保存文件。报错信息通常会给出文件名、行号和错误类型，应当从最后一行开始阅读。' }
        ],
        assignmentId: 'hello-function'
      },
      {
        id: 'variables', title: '变量的命名、使用与常见错误', duration: 18,
        summary: '使用清楚的变量名，并根据错误信息定位拼写和赋值问题。',
        body: [
          { type: 'p', text: '变量是指向某个值的名称。名称只能包含字母、数字和下划线，不能以数字开头，也不要使用 Python 关键字。Python 区分大小写，因此 score 和 Score 是两个变量。' },
          { type: 'code', code: 'student_name = "Ada"\nscore = 96\nprint(student_name, score)' },
          { type: 'tip', text: 'NameError 通常表示变量尚未赋值或名称拼写不一致。给变量起能够表达用途的名字，比使用 a、b、x 更容易维护。' }
        ]
      },
      {
        id: 'strings-case', title: '字符串与大小写方法', duration: 16,
        summary: '创建字符串，并使用 title()、upper() 和 lower() 生成新字符串。',
        body: [
          { type: 'p', text: '字符串是由引号包围的字符序列。字符串方法不会修改原字符串，而是返回一个新值；需要保留结果时，应将它赋给变量。' },
          { type: 'code', code: 'name = "grace hopper"\nprint(name.title())\nprint(name.upper())\nprint(name.lower())' },
          { type: 'tip', text: '统一转成 lower() 很适合做不区分大小写的比较。' }
        ]
      },
      {
        id: 'strings-compose', title: '拼接字符串与添加空白', duration: 18,
        summary: '使用 f-string 组合内容，并用制表符和换行组织输出。',
        body: [
          { type: 'p', text: '现代 Python 推荐使用 f-string 把变量插入字符串。\\n 表示换行，\\t 表示制表符。它们是字符串中的转义序列。' },
          { type: 'code', code: 'language = "Python"\nversion = 3\nprint(f"语言：{language}\\n主版本：\\t{version}")' },
          { type: 'tip', text: '加号也能拼接字符串，但 f-string 在变量较多时更清晰，并且可以直接格式化数字。' }
        ],
        assignmentId: 'profile-line'
      },
      {
        id: 'strings-clean', title: '删除空白与避免引号错误', duration: 15,
        summary: '使用 strip() 清理输入，并正确搭配单引号与双引号。',
        body: [
          { type: 'p', text: 'strip() 删除两端空白，lstrip() 和 rstrip() 分别处理左侧和右侧。引号必须成对；当文本本身包含单引号时，可以使用双引号包围整个字符串。' },
          { type: 'code', code: `raw_name = "  ada lovelace  "\nclean_name = raw_name.strip().title()\nquote = "Python's syntax is readable."\nprint(clean_name, quote)` }
        ],
        assignmentId: 'clean-name'
      },
      {
        id: 'numbers', title: '整数、浮点数与类型转换', duration: 20,
        summary: '进行数值运算，并在文本输出中正确转换类型。',
        body: [
          { type: 'p', text: '整数没有小数部分，浮点数包含小数点。/ 总是产生浮点结果，// 表示整除。现代 Python 可以直接在 f-string 中插入数字；需要显式字符串时使用 str()。' },
          { type: 'code', code: 'age = 18\nheight = 1.72\nprint(age + 1)\nprint(7 / 2, 7 // 2)\nprint("年龄：" + str(age))' },
          { type: 'tip', text: '本课程只使用 Python 3。Python 2 的 print 语句和整数除法规则仅作为历史差异了解，不用于作业。' }
        ]
      },
      {
        id: 'comments-zen', title: '注释、代码意图与 Python 之禅', duration: 14,
        summary: '用注释解释原因，保持代码明确、简单且易读。',
        body: [
          { type: 'p', text: '# 后面的内容是注释。好的注释解释“为什么这样做”，而不是重复代码表面已经说明的事情。代码发生变化时，注释也必须同步更新。' },
          { type: 'code', code: '# 将分钟换算成秒，便于和计时器结果比较\nminutes = 5\nseconds = minutes * 60\nprint(seconds)' },
          { type: 'tip', text: '在实验环境运行 import this 可以阅读 Python 之禅。核心精神是：清晰优于晦涩，简单优于复杂，可读性很重要。' }
        ]
      }
    ]
  },
  {
    id: 'lists-loops',
    number: 2,
    title: '列表、循环与代码组织',
    description: '管理一组数据，使用循环、切片、列表解析和元组编写结构清楚的程序。',
    lessons: [
      {
        id: 'list-basics', title: '列表、元素与从 0 开始的索引', duration: 18,
        summary: '创建列表，访问单个元素，并理解正向和负向索引。',
        body: [
          { type: 'p', text: '列表使用方括号保存有顺序的一组值。第一个元素的索引是 0，最后一个元素也可以使用 -1 访问。越过列表范围会产生 IndexError。' },
          { type: 'code', code: 'languages = ["Python", "Go", "Rust"]\nprint(languages[0])\nprint(languages[-1])\nprint(f"我正在学习 {languages[0]}")' }
        ]
      },
      {
        id: 'list-change', title: '修改、添加和删除元素', duration: 22,
        summary: '使用索引、append()、insert()、pop() 和 remove() 更新列表。',
        body: [
          { type: 'p', text: '列表是可变对象。append() 在末尾添加，insert() 在指定位置插入；pop() 删除并返回元素，remove() 按值删除第一次出现的元素。' },
          { type: 'code', code: 'tasks = ["阅读", "练习"]\ntasks.append("复习")\ntasks.insert(1, "记录")\ndone = tasks.pop(0)\nprint(done, tasks)' },
          { type: 'tip', text: '如果还要使用被删除的值，选择 pop()；如果只知道值而不知道位置，选择 remove()。' }
        ]
      },
      {
        id: 'list-order', title: '排序、长度与索引安全', duration: 20,
        summary: '区分永久排序和临时排序，并在访问前检查列表长度。',
        body: [
          { type: 'p', text: 'sort() 原地改变列表，sorted() 返回排序后的新列表。reverse() 反转当前顺序，len() 返回元素数量。空列表没有索引 0。' },
          { type: 'code', code: 'names = ["Lin", "Ada", "Guido"]\nprint(sorted(names))\nprint(names)\nnames.sort(reverse=True)\nprint(names, len(names))' }
        ],
        assignmentId: 'sorted-copy'
      },
      {
        id: 'for-loops', title: '遍历列表与避免缩进错误', duration: 24,
        summary: '理解 for 循环的代码块、冒号和循环结束后的操作。',
        body: [
          { type: 'p', text: 'for 语句依次把列表元素赋给循环变量。冒号后的缩进代码属于循环；取消缩进后，代码只在整个循环结束后执行一次。Python 通常使用四个空格缩进。' },
          { type: 'code', code: 'students = ["Ada", "Lin", "Sam"]\nfor student in students:\n    print(f"欢迎，{student}")\n    print("课程已经准备好。")\n\nprint("全部通知完成。")' },
          { type: 'tip', text: '忘记冒号、应该缩进却未缩进，以及循环后仍然保留缩进，是初学阶段最常见的三类错误。' }
        ]
      },
      {
        id: 'ranges', title: 'range()、数值列表与统计', duration: 22,
        summary: '生成整数序列，并使用 min()、max() 和 sum() 处理数据。',
        body: [
          { type: 'p', text: 'range(start, stop) 包含起点但不包含终点。list() 可以把它转为列表。min()、max() 和 sum() 提供常用统计结果。' },
          { type: 'code', code: 'numbers = list(range(1, 6))\nprint(numbers)\nprint(min(numbers), max(numbers), sum(numbers))' }
        ],
        assignmentId: 'number-window'
      },
      {
        id: 'comprehensions', title: '列表解析', duration: 18,
        summary: '用一个清晰表达式生成新列表。',
        body: [
          { type: 'p', text: '列表解析把“循环、计算、收集结果”组合成一个表达式。逻辑较复杂时应改用普通循环，避免为了简短而牺牲可读性。' },
          { type: 'code', code: 'squares = [number ** 2 for number in range(1, 6)]\nprint(squares)' }
        ],
        assignmentId: 'square-window'
      },
      {
        id: 'slices-copy', title: '切片、遍历切片与复制列表', duration: 21,
        summary: '使用 start:stop 取得列表的一部分，并创建独立副本。',
        body: [
          { type: 'p', text: '切片同样包含起点、不包含终点。省略起点或终点表示从开头或直到末尾。items[:] 会创建浅副本，而 copy = items 只是让两个变量指向同一个列表。' },
          { type: 'code', code: 'items = [1, 2, 3, 4, 5]\nprint(items[1:4])\ncopy = items[:]\ncopy.append(6)\nprint(items, copy)' }
        ]
      },
      {
        id: 'tuples-style', title: '元组与代码格式', duration: 17,
        summary: '使用不可变序列表达固定数据，并遵循一致的格式。',
        body: [
          { type: 'p', text: '元组使用圆括号，元素不能直接修改。如果整体需求变化，可以把变量重新赋值为一个新元组。代码应保持四空格缩进、适当空行和合理行长。' },
          { type: 'code', code: 'dimensions = (1920, 1080)\nfor value in dimensions:\n    print(value)\n\ndimensions = (1280, 720)\nprint(dimensions)' },
          { type: 'tip', text: '格式不是装饰：一致的布局能降低阅读成本，并帮助你更早发现缩进和结构错误。' }
        ],
        assignmentId: 'rectangle-area'
      }
    ]
  }
];

const assignments = {
  'hello-function': {
    id: 'hello-function', chapterId: 'foundations', lessonId: 'hello-world', title: '作业：生成欢迎语',
    prompt: '在 Solution 类中编写 hello_world(name)，返回格式完全为 Hello, 名字! 的字符串。不要在方法中写死测试名字。',
    functionName: 'hello_world', starterCode: 'class Solution:\n    def hello_world(self, name: str) -> str:\n        # 在这里返回欢迎语\n        pass\n',
    examples: [{ call: 'Solution().hello_world("Ada")', output: '"Hello, Ada!"', explanation: '把传入的名字放入欢迎语并返回字符串。' }],
    makeCases() { return randomNames(6).map(name => ({ args: [name], expected: `Hello, ${name}!` })); }
  },
  'profile-line': {
    id: 'profile-line', chapterId: 'foundations', lessonId: 'strings-compose', title: '作业：组合用户信息',
    prompt: '在 Solution 类中编写 profile_line(name, age)，返回“名字今年age岁。”。age 会是随机整数，必须正确转换并拼接。',
    functionName: 'profile_line', starterCode: 'class Solution:\n    def profile_line(self, name: str, age: int) -> str:\n        # 可以使用 f-string\n        pass\n',
    examples: [{ call: 'Solution().profile_line("Lin", 18)', output: '"Lin今年18岁。"', explanation: '将字符串和整数组织成指定格式后返回。' }],
    makeCases() { return randomNames(5).map(name => { const age = crypto.randomInt(8, 81); return { args: [name, age], expected: `${name}今年${age}岁。` }; }); }
  },
  'clean-name': {
    id: 'clean-name', chapterId: 'foundations', lessonId: 'strings-clean', title: '作业：清理姓名',
    prompt: '在 Solution 类中编写 clean_name(raw_name)，删除两端空白并把每个单词的首字母改为大写。',
    functionName: 'clean_name', starterCode: 'class Solution:\n    def clean_name(self, raw_name: str) -> str:\n        pass\n',
    examples: [{ call: 'Solution().clean_name("  ada lovelace  ")', output: '"Ada Lovelace"', explanation: '先删除两端空白，再统一每个单词的大小写。' }],
    makeCases() { return ['  ada lovelace ', '\tgrace hopper\n', '  guido VAN rossum  ', 'lin'].map(value => ({ args: [value], expected: value.trim().replace(/\s+/g, ' ').split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ') })); }
  },
  'sorted-copy': {
    id: 'sorted-copy', chapterId: 'lists-loops', lessonId: 'list-order', title: '作业：安全排序',
    prompt: '在 Solution 类中编写 sorted_copy(names)，返回按字母升序排列的新列表，并且不能修改传入的原列表。',
    functionName: 'sorted_copy', preserveArgs: true, starterCode: 'class Solution:\n    def sorted_copy(self, names: List[str]) -> List[str]:\n        pass\n',
    examples: [{ call: 'Solution().sorted_copy(["Lin", "Ada", "Guido"])', output: '["Ada", "Guido", "Lin"]', explanation: '返回新列表，原来的 names 顺序不能改变。' }],
    makeCases() { return Array.from({ length: 6 }, () => { const values = shuffled(randomNames(crypto.randomInt(3, 7))); return { args: [values], expected: [...values].sort() }; }); }
  },
  'number-window': {
    id: 'number-window', chapterId: 'lists-loops', lessonId: 'ranges', title: '作业：创建数字区间',
    prompt: '在 Solution 类中编写 number_window(start, stop)，返回从 start 开始、到 stop 之前结束的整数列表。',
    functionName: 'number_window', starterCode: 'class Solution:\n    def number_window(self, start: int, stop: int) -> List[int]:\n        pass\n',
    examples: [{ call: 'Solution().number_window(2, 6)', output: '[2, 3, 4, 5]', explanation: '包含 start，不包含 stop。' }],
    makeCases() { return Array.from({ length: 7 }, () => { const start = crypto.randomInt(-12, 15), stop = start + crypto.randomInt(1, 10); return { args: [start, stop], expected: Array.from({ length: stop - start }, (_, index) => start + index) }; }); }
  },
  'square-window': {
    id: 'square-window', chapterId: 'lists-loops', lessonId: 'comprehensions', title: '作业：平方列表解析',
    prompt: '在 Solution 类中编写 square_window(start, stop)，返回区间内每个整数平方组成的列表。建议使用列表解析。',
    functionName: 'square_window', starterCode: 'class Solution:\n    def square_window(self, start: int, stop: int) -> List[int]:\n        pass\n',
    examples: [{ call: 'Solution().square_window(1, 5)', output: '[1, 4, 9, 16]', explanation: '对区间 [start, stop) 中的每个整数求平方。' }],
    makeCases() { return Array.from({ length: 7 }, () => { const start = crypto.randomInt(-8, 8), stop = start + crypto.randomInt(1, 9); return { args: [start, stop], expected: Array.from({ length: stop - start }, (_, index) => (start + index) ** 2) }; }); }
  },
  'rectangle-area': {
    id: 'rectangle-area', chapterId: 'lists-loops', lessonId: 'tuples-style', title: '作业：元组中的尺寸',
    prompt: '在 Solution 类中编写 rectangle_area(dimensions)，dimensions 是包含宽和高的二元素列表，返回面积。',
    functionName: 'rectangle_area', starterCode: 'class Solution:\n    def rectangle_area(self, dimensions: List[int]) -> int:\n        pass\n',
    examples: [{ call: 'Solution().rectangle_area([8, 5])', output: '40', explanation: '将列表中的宽和高相乘并返回面积。' }],
    makeCases() { return Array.from({ length: 6 }, () => { const width = crypto.randomInt(1, 101), height = crypto.randomInt(1, 101); return { args: [[width, height]], expected: width * height }; }); }
  }
};

function randomNames(count) {
  const names = ['Ada', 'Grace', 'Lin', 'Guido', 'Sam', 'Maya', 'Noah', 'Iris', 'Kai', 'Zoe'];
  return shuffled(names).slice(0, Math.min(count, names.length));
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = crypto.randomInt(0, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function publicCourse() {
  return {
    id: 'python-foundations-v1', title: 'Python 基础课程',
    chapters: chapters.map(chapter => ({ ...chapter, lessons: chapter.lessons.map(lesson => ({ ...lesson, assignment: lesson.assignmentId ? publicAssignment(assignments[lesson.assignmentId]) : null })) }))
  };
}

function publicAssignment(assignment) {
  if (!assignment) return null;
  return { id: assignment.id, title: assignment.title, prompt: assignment.prompt, functionName: assignment.functionName, starterCode: assignment.starterCode, examples: assignment.examples || [] };
}

function getAssignment(id) { return assignments[id] || null; }

function makeEvaluation(assignment) {
  return { className: 'Solution', functionName: assignment.functionName, preserveArgs: Boolean(assignment.preserveArgs), cases: assignment.makeCases() };
}

function makeVisibleEvaluation(assignment) {
  const evaluation = makeEvaluation(assignment);
  evaluation.cases = evaluation.cases.slice(0, Math.min(3, evaluation.cases.length));
  return evaluation;
}

module.exports = { publicCourse, getAssignment, makeEvaluation, makeVisibleEvaluation };
