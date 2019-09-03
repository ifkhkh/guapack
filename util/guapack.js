const fs = require('fs') // 读写文件
const path = require('path') // 处理路径
const parser = require('@babel/parser') // ast parser
const traverse = require('@babel/traverse').default // 从 ast 中收集依赖的相对路径
const { transformFromAstSync } = require('@babel/core') // 根据 ast sourceCode 转换成 es5

// IIFE 立即调用的函数表达式创建出来的一个闭包
const gidGenerator = (() => {
    let a = 0
    let f = () => {
        a = a + 1
        return a
    }
    return f
})()

const resolvePath = (baseDir, relativePath) => {
    let p = path.resolve(baseDir, relativePath)
    let fullName = require.resolve(p)
    return fullName
}

// 读文件
const readFile = (pathname) => {
    let txt = fs.readFileSync(pathname, {
        encoding: 'utf-8'
    })
    return txt
}

const astFromCode = code => {
    let ast = parser.parse(code, {
        sourceType: 'module', // 代码中有 import from 语法需要增加此 module 参数处理
    })
    return ast
}

const astFromEntry = entry => {
    let t = readFile(entry)
    let ast = astFromCode(t)
    return ast
}

const codeConvert = code => {
    let ast = astFromCode(code)
    let r = transformFromAstSync(ast, code, {
        // 代码转成 ast 后转成 es5
        presets: ['@babel/preset-env']
    }).code
    return r
}

const collectDependencies = entry => {
    let ast = astFromEntry(entry)
    let baseDir = path.dirname(entry) // 拿到根目录路径
    let o = {}
    traverse(ast, {
        // ImportDeclaration 此函数是为了处理 import a from b 语法
        ImportDeclaration: function (path) {
            let relativePath = path.node.source.value
            // 分析出来的每个依赖的 相对路径
            let fullPath = resolvePath(baseDir, relativePath)
            // 处理成 module 的完整路径
            o[relativePath] = fullPath
        }
    })
    return o
}

// 根据 entry 读取文件循环遍历调用拿到依赖图
const graphFromEntry = entry => {
    let o = {}
    let id = gidGenerator()
    let dependencies = collectDependencies(entry)
    let content = readFile(entry)
    let code = codeConvert(content)
    o[entry] = {
        // 每个依赖的详细结构
        id,
        dependencies,
        content,
        code,
    }
    // 拿到自己的依赖的所有的绝对路径，逐个再去收集他们的依赖树状对象合并到一起
    Object.values(dependencies).forEach(p => {
        let d = graphFromEntry(p)
        Object.assign(o, d)
    })
    return o
}

const moduleCodeTemplate = (graph, mapping) => {
    let m = JSON.stringify(mapping)
    let s = `
        ${graph.id}: [
            function(require, module, exports) {
                ${graph.code}
            },
            ${m}
        ],
    `
    return s
}

const moduleCodeFromGraph = (graph) => {
    let code = ''
    Object.values(graph).forEach(g => {
        let ds = g.dependencies
        console.log(ds, '::: ds  is here')
        let o = {}
        // 建立一个依赖相对路径映射依赖 graph id 的对象，
        // 后面运行代码时可以根据代码里写的相对路径来拿到 id 跳转对应的 graph
        Object.entries(ds).forEach(([relativePath, absPath]) => {
            o[relativePath] = graph[absPath].id
        })
        code += moduleCodeTemplate(g, o)
    })
    return `{${code}}`
}

const codeTemplate = (modules) => {
    let s = `
        (function (modules) {
            function require(id) {
                const [fn, mapping] = modules[id]
    
                function localRequire(name) {
                    let id = mapping[name]
                    let r = require(id)
                    return r
                }
    
                const localModule = {
                    exports: {},
                }
                fn(localRequire, localModule, localModule.exports)
    
                let result = localModule.exports
                return result
            }
            require(1)
        })(${modules})
    `
    return s
}

//递归创建目录 同步方法
const mkDirSync = (dirName) => {
    if (fs.existsSync(dirName)) {
        return true
    } else {
        let dName = path.dirname(dirName)
        if (mkDirSync(dName)) {
            fs.mkdirSync(dirName)
            return true
        }
    }
}

const saveCode = (code, distPath) => {
    let dirName = path.dirname(distPath)
    let notExist = fs.existsSync(dirName) === false
    if (notExist) {
        mkDirSync(dirName)
    }
    fs.writeFileSync(distPath, code)
}

const bigPack = (entry, distPath) => {
    let graph = graphFromEntry(entry)
    console.log(graph, '::: graph  is here')
    let moduleCode = moduleCodeFromGraph(graph)
    console.log(moduleCode, '::: moduleCode  is here')
    let code = codeTemplate(moduleCode)
    console.log(code, '::: code  is here')
    saveCode(code, distPath)
}

/*
依赖的版本详见 package.json
1、获取树状依赖对象
    根据入口绝对路径拿到文件 txt, 读取文件: fs.readFileSync;
    根据读到的 txt code 生成 ast, 生成 ast: babel/parser;
    根据 entry, ast 来收集所有的依赖, 获取所有依赖的的相对路径: (babel/traverse).default;
    树状对象由 id, dependencies, content, code 组成;
    获得一个树状对象后，再根据自己的依赖去递归遍历依赖的树状依赖对象;

2、根据树状依赖对象拼接 module template 代码
    遍历每个树状依赖对象的

* */
module.exports = bigPack