const CHAPTERS = {
  'object-intro': ['Python Objects, Types, and Dot Notation', 'Build an object-oriented mental model through runnable examples and learn what dot notation means.'],
  foundations: ['Variables and Simple Data Types', 'Understand program execution, variables, strings, numbers, comments, and Python readability principles.'],
  'list-intro': ['Introducing Lists', 'Create lists and access, modify, add, remove, and organize their elements.'],
  'list-operations': ['Working with Lists', 'Process collections with loops, range(), comprehensions, slices, and tuples.'],
  conditionals: ['if Statements', 'Use conditional tests to select different execution paths.'],
  dictionaries: ['Dictionaries', 'Represent key-value relationships and learn iteration and nesting.'],
  'input-while': ['User Input and while Loops', 'Read input, control repetition, and update lists and dictionaries with loops.'],
  functions: ['Functions', 'Encapsulate reusable behavior with parameters, return values, flexible arguments, and modules.'],
  classes: ['Classes', 'Study classes, instances, attributes, methods, inheritance, composition, and modular design.'],
  'files-exceptions': ['Files and Exceptions', 'Read and write files, handle failures, and persist data with JSON.'],
  testing: ['Testing Your Code', 'Write automated tests for functions and classes so changes remain verifiable.']
};

const LESSONS = {
  'names-references-memory': 'Prerequisite: Names, References, and Object Identity',
  'program-first-look': 'Programs Coordinate Objects',
  'class-instance-preview': 'A First Look at Classes, Instances, and OOP',
  'dot-notation': 'What Dot Notation Means',
  'built-in-objects': 'Exploring Common Built-in Objects',
  'object-identity': 'Type, Identity, Mutability, and Method Chaining',
  'intro-summary': 'Introduction Summary: Keep Asking Object Questions',
  'hello-world': 'What Happens When hello_world.py Runs',
  variables: 'Variables: Naming, Use, and Name Errors',
  'strings-case': 'Strings and Case-Changing Methods',
  'strings-compose': 'Joining Strings, Tabs, and Newlines',
  'strings-clean': 'Removing Whitespace and Avoiding String Syntax Errors',
  numbers: 'Integers, Floating-Point Numbers, and Conversion',
  'comments-zen': 'Comments and the Zen of Python',
  'foundations-summary': 'Variables and Simple Data Types: Summary',
  'list-basics': 'Lists: Elements, Indexes, and Values',
  'list-change': 'Modifying, Adding, and Removing Elements',
  'list-order': 'Organizing Lists: Sorting, Reversing, and Length',
  'list-index-errors': 'Avoiding Index Errors',
  'list-intro-summary': 'Introducing Lists: Summary',
  'for-loops': 'Looping Through an Entire List',
  'indentation-errors': 'Avoiding Indentation Errors',
  ranges: 'Creating and Summarizing Numeric Lists',
  comprehensions: 'List Comprehensions',
  'slices-copy': 'Working with Part of a List',
  'tuples-style': 'Tuples and Code Style',
  'list-operations-summary': 'Working with Lists: Summary',
  'if-first-look': 'A Simple Example and Conditional Tests',
  'condition-combinations': 'Numbers, Combined Conditions, Membership, and Booleans',
  'if-structures': 'if, if-else, and if-elif-else',
  'if-with-lists': 'Using if Statements with Lists',
  'if-style': 'Formatting if Statements',
  'if-summary': 'if Statements: Summary',
  'dict-first-look': 'A Simple Dictionary',
  'dict-use': 'Accessing, Adding, Modifying, and Removing Dictionary Data',
  'dict-loop': 'Iterating over Dictionaries',
  'dict-nesting': 'Nesting',
  'dict-summary': 'Dictionaries: Summary',
  'input-basics': 'How input() Works',
  'while-basics': 'Introducing while Loops and Exit Control',
  'while-collections': 'Using while Loops with Lists and Dictionaries',
  'input-while-summary': 'User Input and while Loops: Summary',
  'function-definition': 'Defining Functions and Passing Information',
  'function-arguments': 'Passing Arguments',
  'function-return': 'Return Values',
  'function-lists': 'Passing Lists',
  'function-varargs': 'Passing an Arbitrary Number of Arguments',
  'function-modules': 'Storing Functions in Modules',
  'function-style': 'Function Style Guidelines',
  'functions-summary': 'Functions: Summary',
  'class-create': 'Creating and Using Classes',
  'class-instance-use': 'Working with Classes and Instances',
  'class-inheritance': 'Inheritance',
  'class-composition': 'Using Instances as Attributes and Modeling Real Objects',
  'class-imports': 'Importing Classes',
  'class-library-style': 'The Python Standard Library and Class Style',
  'classes-summary': 'Classes: Summary',
  'file-reading': 'Reading Data from Files',
  'file-writing': 'Writing to Files',
  exceptions: 'Exceptions',
  'json-storage': 'Persisting Data and Refactoring',
  'files-summary': 'Files and Exceptions: Summary',
  'test-functions': 'Testing Functions',
  'test-classes': 'Testing Classes',
  'testing-summary': 'Testing Your Code: Summary'
};

const HEADING_LIST = [
  ['变量不是盒子，而是绑定到对象的名称', 'Variables Are Names Bound to Objects'], ['对象的身份、类型和值', 'Object Identity, Type, and Value'], ['== 比较值，is 比较身份', '== Compares Values; is Compares Identity'],
  ['CPython 的小整数缓存', 'CPython’s Small-Integer Cache'], ['为什么直接写 257 也可能得到同一个对象', 'Why Two Literal 257 Values May Still Share an Object'], ['不可变对象：操作后通常重新绑定', 'Immutable Objects: Operations Usually Rebind Names'],
  ['可变对象：多个名称可能共享修改', 'Mutable Objects: Aliases Share Mutations'], ['函数参数采用对象共享模型', 'Function Arguments Use Object Sharing'], ['字符串驻留与显式 intern', 'String Interning and Explicit sys.intern()'],
  ['id() 只在对象存活期间唯一', 'id() Is Unique Only During an Object’s Lifetime'], ['把实现细节变成可靠的实践规则', 'Turn Implementation Details into Reliable Rules'],
  ['程序、数据与操作', 'Programs, Data, and Operations'], ['什么叫对象', 'What Is an Object?'], ['什么叫面向对象', 'What Is Object-Oriented Programming?'], ['类与实例', 'Classes and Instances'],
  ['对象.属性', 'object.attribute'], ['对象.方法()', 'object.method()'], ['属性与方法的区别', 'Attributes vs. Methods'], ['字符串对象', 'String Objects'], ['列表对象', 'List Objects'],
  ['字典对象', 'Dictionary Objects'], ['数字也是对象', 'Numbers Are Objects Too'], ['类型与身份', 'Type and Identity'], ['方法链', 'Method Chaining'], ['函数和类也是对象', 'Functions and Classes Are Objects Too'],
  ['源文件与解释器', 'Source Files and the Interpreter'], ['表达式与输出', 'Expressions and Output'], ['变量', 'Variables'], ['变量的命名和使用', 'Naming and Using Variables'], ['使用变量时避免命名错误', 'Avoiding Name Errors'],
  ['字符串', 'Strings'], ['使用方法修改字符串的大小写', 'Changing String Case with Methods'], ['合并（拼接）字符串', 'Joining (Concatenating) Strings'], ['使用制表符或换行符来添加空白', 'Adding Whitespace with Tabs and Newlines'],
  ['删除空白', 'Removing Whitespace'], ['使用字符串时避免语法错误', 'Avoiding String Syntax Errors'], ['Python 2 中的 print 语句', 'The print Statement in Python 2'], ['整数', 'Integers'], ['浮点数', 'Floating-Point Numbers'],
  ['使用函数 str() 避免类型错误', 'Using str() to Avoid Type Errors'], ['Python 2 中的整数', 'Integers in Python 2'], ['注释', 'Comments'], ['如何编写注释', 'How to Write Comments'], ['该编写什么样的注释', 'What Comments Should Explain'], ['Python 之禅', 'The Zen of Python'],
  ['列表是什么', 'What Is a List?'], ['访问列表元素', 'Accessing List Elements'], ['索引从 0 而不是 1 开始', 'Indexes Start at 0, Not 1'], ['使用列表中的各个值', 'Using Individual List Values'], ['修改列表元素', 'Modifying List Elements'],
  ['在列表中添加元素', 'Adding Elements to a List'], ['从列表中删除元素', 'Removing Elements from a List'], ['使用方法 sort() 对列表进行永久性排序', 'Sorting a List Permanently with sort()'], ['使用函数 sorted() 对列表进行临时排序', 'Sorting Temporarily with sorted()'],
  ['倒着打印列表', 'Printing a List in Reverse Order'], ['确定列表的长度', 'Finding a List’s Length'], ['索引错误', 'Index Errors'], ['遍历整个列表', 'Looping Through an Entire List'], ['深入地研究循环', 'A Closer Look at Loops'],
  ['在 for 循环中执行更多的操作', 'Doing More Work Inside a for Loop'], ['在 for 循环结束后执行一些操作', 'Doing Work After a for Loop'], ['忘记缩进', 'Forgetting to Indent'], ['忘记缩进额外的代码行', 'Forgetting to Indent Additional Lines'],
  ['不必要的缩进', 'Unnecessary Indentation'], ['循环后不必要的缩进', 'Unnecessary Indentation After a Loop'], ['遗漏了冒号', 'Forgetting the Colon'], ['使用函数 range()', 'Using range()'], ['使用 range() 创建数字列表', 'Creating Numeric Lists with range()'],
  ['对数字列表执行简单的统计计算', 'Simple Statistics on Numeric Lists'], ['列表解析', 'List Comprehensions'], ['切片', 'Slicing'], ['遍历切片', 'Looping Through a Slice'], ['复制列表', 'Copying a List'], ['元组', 'Tuples'], ['定义元组', 'Defining a Tuple'],
  ['遍历元组中的所有值', 'Looping Through Tuple Values'], ['修改元组变量', 'Reassigning a Tuple Variable'], ['设置代码格式', 'Formatting Code'], ['格式设置指南', 'Style Guidelines'], ['缩进', 'Indentation'], ['行长', 'Line Length'], ['空行', 'Blank Lines'], ['其他格式设置指南', 'Other Style Guidelines'],
  ['一个简单示例', 'A Simple Example'], ['条件测试', 'Conditional Tests'], ['检查是否相等', 'Checking Equality'], ['检查是否相等时不考虑大小写', 'Case-Insensitive Equality'], ['检查是否不相等', 'Checking Inequality'], ['比较数字', 'Comparing Numbers'],
  ['检查多个条件', 'Checking Multiple Conditions'], ['检查特定值是否包含在列表中', 'Checking Whether a Value Is in a List'], ['检查特定值是否不包含在列表中', 'Checking Whether a Value Is Not in a List'], ['布尔表达式', 'Boolean Expressions'],
  ['简单的 if 语句', 'Simple if Statements'], ['if-else 语句', 'if-else Statements'], ['if-elif-else 结构', 'The if-elif-else Chain'], ['使用多个 elif 代码块', 'Using Multiple elif Blocks'], ['省略 else 代码块', 'Omitting the else Block'], ['测试多个条件', 'Testing Multiple Independent Conditions'],
  ['检查特殊元素', 'Checking for Special Elements'], ['确定列表不是空的', 'Checking That a List Is Not Empty'], ['使用多个列表', 'Using Multiple Lists'], ['设置 if 语句的格式', 'Formatting if Statements'], ['一个简单的字典', 'A Simple Dictionary'], ['访问字典中的值', 'Accessing Dictionary Values'],
  ['添加键—值对', 'Adding Key-Value Pairs'], ['先创建一个空字典', 'Starting with an Empty Dictionary'], ['修改字典中的值', 'Modifying Dictionary Values'], ['删除键—值对', 'Removing Key-Value Pairs'], ['由类似对象组成的字典', 'A Dictionary of Similar Objects'],
  ['遍历所有的键—值对', 'Iterating over Key-Value Pairs'], ['遍历字典中的所有键', 'Iterating over Dictionary Keys'], ['按顺序遍历字典中的所有键', 'Iterating over Keys in Sorted Order'], ['遍历字典中的所有值', 'Iterating over Dictionary Values'],
  ['字典列表', 'A List of Dictionaries'], ['在字典中存储列表', 'Storing Lists in a Dictionary'], ['在字典中存储字典', 'Storing Dictionaries in a Dictionary'], ['函数 input() 的工作原理', 'How input() Works'], ['编写清晰的程序', 'Writing Clear Programs'],
  ['使用 int() 来获取数值输入', 'Using int() for Numeric Input'], ['求模运算符', 'The Modulo Operator'], ['在 Python 2.7 中获取输入', 'Input in Python 2.7'], ['while 循环简介', 'Introducing while Loops'], ['使用 while 循环', 'Using a while Loop'],
  ['让用户选择何时退出', 'Letting the User Choose When to Exit'], ['使用标志', 'Using a Flag'], ['使用 break 退出循环', 'Exiting a Loop with break'], ['在循环中使用 continue', 'Using continue in a Loop'], ['避免无限循环', 'Avoiding Infinite Loops'],
  ['使用 while 循环来处理列表和字典', 'Using while Loops with Lists and Dictionaries'], ['在列表之间移动元素', 'Moving Elements Between Lists'], ['删除包含特定值的所有列表元素', 'Removing Every Occurrence of a Value'], ['使用用户输入来填充字典', 'Filling a Dictionary with User Input'],
  ['定义函数', 'Defining a Function'], ['向函数传递信息', 'Passing Information to a Function'], ['实参和形参', 'Arguments and Parameters'], ['位置实参', 'Positional Arguments'], ['关键字实参', 'Keyword Arguments'], ['默认值', 'Default Values'], ['等效的函数调用', 'Equivalent Function Calls'],
  ['避免实参错误', 'Avoiding Argument Errors'], ['返回值', 'Return Values'], ['返回简单值', 'Returning a Simple Value'], ['让实参变成可选的', 'Making an Argument Optional'], ['返回字典', 'Returning a Dictionary'], ['结合使用函数和 while 循环', 'Combining Functions and while Loops'],
  ['传递列表', 'Passing a List'], ['在函数中修改列表', 'Modifying a List in a Function'], ['禁止函数修改列表', 'Preventing a Function from Modifying a List'], ['传递任意数量的实参', 'Passing an Arbitrary Number of Arguments'], ['结合使用位置实参和任意数量实参', 'Combining Positional and Arbitrary Arguments'],
  ['使用任意数量的关键字实参', 'Using Arbitrary Keyword Arguments'], ['将函数存储在模块中', 'Storing Functions in Modules'], ['导入整个模块', 'Importing an Entire Module'], ['导入特定的函数', 'Importing Specific Functions'], ['使用 as 给函数指定别名', 'Aliasing a Function with as'],
  ['使用 as 给模块指定别名', 'Aliasing a Module with as'], ['导入模块中的所有函数', 'Importing Every Function from a Module'], ['函数编写指南', 'Function Style Guidelines'], ['创建和使用类', 'Creating and Using Classes'], ['创建 Dog 类', 'Creating the Dog Class'], ['根据类创建实例', 'Creating Instances from a Class'],
  ['使用类和实例', 'Working with Classes and Instances'], ['Car 类', 'The Car Class'], ['给属性指定默认值', 'Setting Default Attribute Values'], ['修改属性的值', 'Modifying Attribute Values'], ['继承', 'Inheritance'], ['子类的方法 __init__()', 'The Subclass __init__() Method'], ['Python 2.7 中的继承', 'Inheritance in Python 2.7'],
  ['给子类定义属性和方法', 'Defining Subclass Attributes and Methods'], ['重写父类的方法', 'Overriding Parent Methods'], ['将实例用作属性', 'Using Instances as Attributes'], ['模拟实物', 'Modeling Real-World Objects'], ['导入单个类', 'Importing a Single Class'], ['在一个模块中存储多个类', 'Storing Multiple Classes in a Module'],
  ['从一个模块中导入多个类', 'Importing Multiple Classes from a Module'], ['导入模块中的所有类', 'Importing Every Class from a Module'], ['在一个模块中导入另一个模块', 'Importing One Module into Another'], ['自定义工作流程', 'Choosing an Import Workflow'], ['Python 标准库', 'The Python Standard Library'], ['类编码风格', 'Class Style Guidelines'],
  ['从文件中读取数据', 'Reading Data from Files'], ['读取整个文件', 'Reading an Entire File'], ['文件路径', 'File Paths'], ['逐行读取', 'Reading Line by Line'], ['创建一个包含文件各行内容的列表', 'Creating a List of File Lines'], ['使用文件的内容', 'Working with File Contents'], ['包含一百万位的大型文件', 'Working with a Million-Digit File'],
  ['圆周率值中包含你的生日吗', 'Is Your Birthday in Pi?'], ['写入文件', 'Writing to Files'], ['写入空文件', 'Writing to an Empty File'], ['写入多行', 'Writing Multiple Lines'], ['附加到文件', 'Appending to a File'], ['异常', 'Exceptions'], ['处理 ZeroDivisionError 异常', 'Handling ZeroDivisionError'], ['使用 try-except 代码块', 'Using try-except Blocks'],
  ['使用异常避免崩溃', 'Using Exceptions to Prevent Crashes'], ['else 代码块', 'The else Block'], ['处理 FileNotFoundError 异常', 'Handling FileNotFoundError'], ['分析文本', 'Analyzing Text'], ['使用多个文件', 'Working with Multiple Files'], ['失败时一声不吭', 'Failing Silently'], ['决定报告哪些错误', 'Deciding Which Errors to Report'],
  ['存储数据', 'Persisting Data'], ['使用 json.dump() 和 json.load()', 'Using json.dump() and json.load()'], ['保存和读取用户生成的数据', 'Saving and Loading User-Generated Data'], ['重构', 'Refactoring'], ['测试函数', 'Testing Functions'], ['单元测试和测试用例', 'Unit Tests and Test Cases'], ['可通过的测试', 'A Passing Test'], ['不能通过的测试', 'A Failing Test'],
  ['测试未通过时怎么办', 'Responding to a Failed Test'], ['添加新测试', 'Adding New Tests'], ['测试类', 'Testing Classes'], ['各种断言方法', 'Common Assertion Methods'], ['一个要测试的类', 'A Class to Test'], ['测试 AnonymousSurvey 类', 'Testing the AnonymousSurvey Class'], ['方法 setUp()', 'The setUp() Method'], ['小结', 'Summary']
];

const HEADING_EN = Object.fromEntries(HEADING_LIST);

const ASSIGNMENTS = {
  'hello-function': ['Assignment: Build a Greeting', 'Implement hello_world(name) in class Solution and return exactly "Hello, name!".', 'Use the supplied name and return the formatted string.'],
  'profile-line': ['Assignment: Compose a Profile Line', 'Implement profile_line(name, age) and return exactly "name is age years old.".', 'An f-string is a concise solution.'],
  'clean-name': ['Assignment: Normalize a Name', 'Implement clean_name(raw_name): remove extra whitespace and convert every word to title case.', 'Normalize both outer whitespace and repeated spaces between words.'],
  'sorted-copy': ['Assignment: Sort Safely', 'Implement sorted_copy(names). Return a new list in ascending order without modifying the input list.', 'Return a new list and preserve the original order of the input object.'],
  'number-window': ['Assignment: Build an Integer Range', 'Implement number_window(start, stop) and return the integers in the half-open interval [start, stop).', 'Include start and exclude stop.'],
  'square-window': ['Assignment: Square a Range', 'Implement square_window(start, stop) and return the square of every integer in the interval.', 'A list comprehension is a natural fit.'],
  'rectangle-area': ['Assignment: Rectangle Area', 'Implement rectangle_area(dimensions). Read width and height from the two-element list and return their product.', 'Return width multiplied by height.'],
  'object-description': ['Assignment: Describe an Object', 'Implement describe_object(value) and return a "type:value" string, for example "str:Python".', 'Use type(value).__name__ to obtain the type name.'],
  'car-label': ['Assignment: Describe Instance State', 'Implement car_label(make, model, year) and return the string "year make model".', 'Keep self in the instance method and construct the description from parameters.'],
  'score-level': ['Assignment: Score Band', 'Implement score_level(score): return A for 90+, B for 80–89, C for 60–79, and D otherwise.', 'Evaluate thresholds from highest to lowest.'],
  'inventory-total': ['Assignment: Inventory Total', 'Implement inventory_total(inventory) and return the sum of every quantity in the dictionary.', 'Iterate over values() or use sum().'],
  'remove-all': ['Assignment: Remove Every Match', 'Implement remove_all(items, target). Return a new list without any target values and do not modify the input.', 'Every matching element must be removed.'],
  'build-profile': ['Assignment: Build a Profile Dictionary', 'Implement build_profile(name, age, city) and return a dictionary containing those three keys.', 'Return structured data as a dictionary.'],
  'safe-divide': ['Assignment: Safe Division', 'Implement safe_divide(a, b). Return a / b normally and None when b is zero.', 'Catch ZeroDivisionError or check the denominator first.'],
  'normalize-username': ['Assignment: Normalize a Username', 'Implement normalize_username(raw): strip outer whitespace, lowercase the text, and replace internal spaces with underscores.', 'Test whitespace and letter-case edge cases.']
};

const CODE_REPLACEMENTS = [
  ['我是 {self.name}', 'I am {self.name}'], ['NameError：Score 与 score 不同', 'NameError: Score and score are different names'], ['姓名：{full}', 'Name: {full}'], ['他说：“继续练习。”', 'She said, "Keep practicing."'],
  ['这是 Python 3 的 print() 函数', 'This is the print() function in Python 3'], ['年龄：', 'Age: '], ['明年：{age + 1}', 'Next year: {age + 1}'], ['# 将分钟换算为秒，便于和计时器结果比较', '# Convert minutes to seconds for comparison with the timer'],
  ['我正在学习 {languages[0].upper()}', 'I am learning {languages[0].upper()}'], ['列表为空', 'The list is empty'], ['欢迎，{student}', 'Welcome, {student}'], ['课程已经准备好。', 'The course is ready.'], ['全部处理完成', 'All items processed'], ['循环结束', 'Loop finished'],
  ['可以进入', 'Access granted'], ['已准备', 'Ready'], ['温暖', 'Warm'], ['偏凉', 'Cool'], ['管理员权限', 'Administrator access'], ['开始处理', 'Start processing'], ['没有请求', 'No requests'], ['提供 {language}', 'Available: {language}'], ['暂不提供 {language}', 'Unavailable: {language}'], ['允许进入', 'Entry allowed'],
  ['# 在完整 JupyterLab 中取消注释体验交互输入', '# Uncomment in JupyterLab to try interactive input'], ['# name = input("请输入名字：")', '# name = input("Enter your name: ")'], ['input() 的返回类型是 str', 'input() returns a str'], ['返回一条欢迎语。', 'Return a greeting.'], ['返回矩形面积。', 'Return the rectangle area.'],
  ['正在加油', 'Filling the fuel tank'], ['电动车没有油箱', 'An electric car has no fuel tank'], ['不是整数', 'Not an integer']
];

function translateCode(code) {
  return [...CODE_REPLACEMENTS].sort((a, b) => b[0].length - a[0].length).reduce((value, [source, target]) => value.split(source).join(target), code);
}

const TOPIC_EXPLANATIONS = {
  'Variables Are Names Bound to Objects': 'A Python variable is best understood as a name. Assignment binds that name to an object; assigning one name to another usually makes both names refer to the same object at that moment instead of immediately copying it.',
  'Object Identity, Type, and Value': 'Every object has an identity, a type, and a value. type() reports the type, while id() returns an identity integer that remains stable during the object’s lifetime. CPython normally uses the memory address for this value, but other Python implementations do not promise a physical address.',
  '== Compares Values; is Compares Identity': 'The == operator asks whether values are equal; is asks whether both expressions refer to the very same object. Use == for ordinary data. Reserve is mainly for None and explicit sentinel objects, not numeric or string value comparisons.',
  'CPython’s Small-Integer Cache': 'Current CPython preallocates integer objects from -5 through 256 inclusive. Separately constructed values in that range may therefore share identity. This is a CPython implementation detail, not a portable Python language rule, and correctness must never depend on it.',
  'Why Two Literal 257 Values May Still Share an Object': 'A compiler may reuse an identical constant within one code unit, and runtimes may intern strings. Literal identity can therefore differ between a file, a function, and an interactive session. Treat this only as an optimization to observe; use == for numeric equality.',
  'Immutable Objects: Operations Usually Rebind Names': 'Integers, floats, strings, and tuples are immutable. An operation such as a += 1 cannot change the original integer; it produces or obtains another integer object and rebinds a, leaving any other name bound to the old object unchanged.',
  'Mutable Objects: Aliases Share Mutations': 'Lists, dictionaries, and sets are mutable. When two names refer to the same mutable object, a mutation through either name is visible through the other. Create an explicit shallow or deep copy when independent state is required.',
  'Function Arguments Use Object Sharing': 'A parameter is bound to the object supplied by the caller, a model commonly called call by sharing. Rebinding the parameter does not replace the caller’s name, while mutating a shared mutable object is visible to the caller. This is not reference passing that can directly rebind a caller variable.',
  'String Interning and Explicit sys.intern()': 'An interpreter may automatically reuse some string objects, but the scope is not a stable language guarantee. sys.intern() explicitly interns equal strings so they can share identity. Ordinary text comparisons should still use ==.',
  'id() Is Unique Only During an Object’s Lifetime': 'id() is stable and collision-free only among objects whose lifetimes overlap. After an object is destroyed, its former identity integer may be reused. Do not store id() as a permanent record key or a cross-process identifier.',
  'Turn Implementation Details into Reliable Rules': 'Use == for values and is for None or a deliberate sentinel. Anticipate shared mutations, copy when independence matters, use id() for learning and debugging only, and never rely on integer caching, constant reuse, or string interning for program correctness.'
};

function topicExplanation(title) {
  return TOPIC_EXPLANATIONS[title] || `This section explains ${title.toLowerCase()} in Python. Pay attention to object types, return values, mutation, control flow, and exceptions as applicable, then run the example to verify the behavior.`;
}

function englishAssignment(assignment) {
  if (!assignment) return null;
  const localized = ASSIGNMENTS[assignment.id];
  return {
    ...assignment,
    title: localized?.[0] || 'Programming Assignment',
    prompt: localized?.[1] || 'Complete the specified method and return the required result.',
    examples: (assignment.examples || []).map(item => ({
      ...item,
      output: assignment.id === 'profile-line' ? '"Lin is 18 years old."' : item.output,
      explanation: localized?.[2] || 'Return the requested value.'
    }))
  };
}

function englishCourse(course) {
  return {
    ...course,
    title: 'Python: From Object-Oriented Thinking to Engineering Practice',
    chapters: course.chapters.map(chapter => {
      const localizedChapter = CHAPTERS[chapter.id] || [chapter.id, 'Python foundations and practice.'];
      return {
        ...chapter,
        title: localizedChapter[0],
        description: localizedChapter[1],
        lessons: chapter.lessons.map(lesson => {
          const title = LESSONS[lesson.id] || lesson.id;
          return {
            ...lesson,
            title,
            summary: `Learn ${title.toLowerCase()} through concise explanations and independently runnable examples.`,
            body: lesson.body.map(block => {
              if (block.type === 'code') return { ...block, code: translateCode(block.code) };
              if (block.type === 'heading') {
                const heading = HEADING_EN[block.title] || 'Python Concept';
                return { ...block, title: heading, text: topicExplanation(heading) };
              }
              if (block.type === 'tip') return { ...block, text: 'Tip: inspect the object type, returned value, and any mutation or exception before moving to the next example.' };
              return { ...block, text: `Review the key ideas from ${title.toLowerCase()} and connect them to the runnable examples in this lesson.` };
            }),
            assignment: englishAssignment(lesson.assignment)
          };
        })
      };
    })
  };
}

module.exports = { englishCourse };
