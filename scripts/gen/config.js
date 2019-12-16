const path = require('path');
const http = require('http');
const axios = require('axios');
const https = require('https');
const chalk = require('chalk');

// 命令要在项目根目录下执行
const PAGES_DIR = path.join(process.cwd(), '/src/pages');

// 模块标志字符串，用来拆分各个配置块
const BLOCK_FLAG = '######';

// 所有可用表单类型
const ELEMENT_TYPES = [
    'input',
    'hidden',
    'number',
    'textarea',
    'password',
    'mobile',
    'email',
    'select',
    'select-tree',
    'checkbox',
    'checkbox-group',
    'radio',
    'radio-group',
    'switch',
    'date',
    'time',
    'date-time',
    'date-range',
    'cascader',
    'json',
    'icon-picker',
];

// 随机生成不重复field字符串
let fieldCount = 1;

function getRandomField() {
    return `field${fieldCount++}`;
}

function arrayRemove(arr, item) {
    const index = arr.indexOf(item);
    if (index < 0) return;
    arr.splice(index, 1);
}

/**
 * 从字符串中提取form表单元素相关配置
 * @param str
 */
function getFormElement(str) {
    // 用户名 userName input r
    if (!str) return;
    let strArr = str;
    if (typeof str === 'string') strArr = str.split(' ');

    // 非表单相关
    const excludes = [' ', 'q', 'f'];
    strArr = strArr.filter(item => !excludes.includes(item)); // 过滤掉不想关配置

    if (!strArr.length) return;

    // 获取表单类型 默认 input
    const type = strArr.find(item => ELEMENT_TYPES.includes(item)) || 'input';
    arrayRemove(strArr, type);

    // 获取是否必填
    const required = strArr.includes('r');
    arrayRemove(strArr, 'r');

    // 获取 label field
    let [label, field] = strArr;
    if (!field) field = getRandomField();

    return {
        type,
        label,
        field,
        required,
    }
}

function getBlockConfig(configArr, title) {
    const startIndex = configArr.findIndex(item => {
        return item.replace(/\s/g, '').includes(BLOCK_FLAG + title);
    });

    // 没有相关配置
    if (startIndex < 0) return null;

    let endIndex = configArr.slice(startIndex + 1)
        .findIndex(item => item.includes(BLOCK_FLAG));

    // 有可能是最后一个配置项
    endIndex = endIndex < 0 ? configArr.length : endIndex + startIndex;

    return configArr
        .slice(startIndex + 1, endIndex + 1)
        .filter(item => {
            return item
                // 都是被注释掉的行
                && !item.startsWith('//')
                && !item.startsWith('#')
                && !item.startsWith(';')
        })
        .map(item => {
            // 将一行文本进行空格拆分 并去掉空元素
            const lineArr = item.split(' ').filter(item => !!item);

            // 将注释去掉
            const index = lineArr.findIndex(it => it === '//' || it === '#' || it === ';');
            if (index !== -1) lineArr.splice(index);

            return lineArr;
        })
}

function getHandle(configArr, title, defaultProps) {
    const config = getBlockConfig(configArr, title);

    if (!config) return null;

    let result = null;

    config.forEach((item, i) => {
        let [text, handle, icon] = item;
        if (!handle) {
            const index = defaultProps.indexOf(text);
            handle = index > -1 ? defaultProps[index + 1] : `handle${i}`;
        }
        if (!icon) {
            const index = defaultProps.indexOf(text);
            icon = index > -1 ? defaultProps[index + 2] : void 0;
        }

        if (!result) result = [];

        result.push({
            text,
            handle,
            icon,
        })
    });

    return result
}

function getElement(configArr, title, key, fromColumn) {
    const config = getBlockConfig(configArr, title) || [];
    const column = fromColumn ? getBlockConfig(configArr, '表格列配置') : [];

    if (!config.length && !column.length) return null;

    const columns = column.filter(item => item.includes(key));
    const results = config.map(item => getFormElement(item));
    const resultColumn = columns.map(item => getFormElement(item));

    // 去重
    const result = [...results];
    resultColumn.forEach(item => {
        if (!result.find(it => it.label === item.label)) {
            result.push(item);
        }
    });

    if (!result.length) return null;

    return result;
}

// 接口配置
function getInterfaceConfig(configArr) {
    const config = getBlockConfig(configArr, '接口配置');

    if (!config) return null;

    let result = null;

    [
        'url',
        'userName',
        'password',
    ].forEach(key => {
        const cfg = config.find(item => item.length && item[0] === key);
        if (cfg) {
            if (!result) result = {};

            result[key] = cfg[1];
        }
    });

    return result;
}

// 数据库配置
function getDataBaseConfig(configArr) {
    const config = getBlockConfig(configArr, '数据库配置');

    if (!config) return null;

    let result = null;
    [
        'url',
        'userName',
        'password',
        'tableName',
    ].forEach(key => {
        const cfg = config.find(item => item.length && item[0] === key);
        if (cfg) {
            if (!result) result = {};

            result[key] = cfg[1];
        }
    });

    return result;
}

// 获取基本配置
function getBaseConfig(configArr) {
    const config = getBlockConfig(configArr, '基础配置');

    if (!config) return null;

    let result = null;

    const methodMap = {
        search: '查询',
        detail: '详情',
        modify: '修改',
        add: '添加',
        delete: '删除',
        batchDelete: '批量删除',
    };

    const methods = Object.values(methodMap);

    const keyMap = {
        'moduleName': '目录',
        'path': '路由',
    };

    const others = Object.values(keyMap);

    [
        ...others,
        ...methods,
    ].forEach(key => {
        const cfg = config.find(item => item.length && item[0] === key);
        if (cfg) {

            if (methods.includes(key)) {
                const [name, method, url, ...excludeFields] = cfg;
                const km = Object.entries(methodMap).find(([, vv]) => vv === key);
                const k = km ? km[0] : null;

                if (k) {
                    if (!result) result = {};
                    if (!result.ajax) result.ajax = {};
                    result.ajax[k] = {
                        name,
                        method,
                        url,
                        excludeFields,
                    }
                }
            }

            if (others.includes(key)) {
                const [, value] = cfg;
                const km = Object.entries(keyMap).find(([, vv]) => vv === key);
                const k = km ? km[0] : null;

                if (!result) result = {};
                result[k] = value;
            }
        }
    });

    // 基于RestFul规范，处理默认ajax请求url
    const {moduleName} = result;
    Object.entries(methodMap).forEach(([method, name]) => {
        if (!result.ajax[method]) {
            if (method === 'search') result.ajax[method] = {name, method: 'get', url: `/${moduleName}`};
            if (method === 'detail') result.ajax[method] = {name, method: 'get', url: `/${moduleName}/{id}`};
            if (method === 'modify') result.ajax[method] = {name, method: 'put', url: `/${moduleName}`};
            if (method === 'add') result.ajax[method] = {name, method: 'post', url: `/${moduleName}`};
            if (method === 'delete') result.ajax[method] = {name, method: 'del', url: `/${moduleName}/{id}`};
            if (method === 'batchDelete') result.ajax[method] = {name, method: 'del', url: `/${moduleName}`};
        }
    });

    // 处理页面默认路由地址
    if (!result.path) result.path = `/${moduleName}`;

    return result;
}

// 获取页面类型配置
function getPagesConfig(configArr, moduleName = '') {
    const config = getBlockConfig(configArr, '页面类型配置');

    if (!config) return null;

    const defaultPages = [
        '列表页', 'list.js', 'index.jsx',
        '弹框编辑', 'edit-modal.js', 'EditModal.jsx',
        '页面编辑', 'edit.js', 'Edit.jsx',
    ];

    let result = null;

    config.forEach(item => {
        const [typeName, templateAndFilePath] = item;
        if (!templateAndFilePath) {
            const index = defaultPages.indexOf(typeName);
            if (index < 0) return;
            const templateFileName = defaultPages[index + 1];
            const fileName = defaultPages[index + 2];

            if (!result) result = [];
            result.push({
                typeName,
                filePath: path.join(PAGES_DIR, moduleName, fileName),
                template: path.join(__dirname, 'templates', templateFileName),
            })
        } else {
            const [templateFilePath, fileName] = templateAndFilePath.split('->');
            if (!result) result = [];
            result.push({
                typeName,
                filePath: path.join(PAGES_DIR, moduleName, fileName),
                // 用户模版要基于项目根目录编写
                template: path.join(process.cwd(), templateFilePath),
            })
        }
    });

    return result
}

// 获取查询条件配置
function getQueryConfig(configArr, fromColumn) {
    return getElement(configArr, '查询条件配置', 'q', fromColumn);
}

// 获取工具条配置
function getToolConfig(configArr) {
    const defaultProps = [
        '添加', '', 'plus',
        '删除', 'handleBatchDelete', 'delete',
        '导入', 'handleImport', 'import',
        '导出', 'handleExport', 'export',
    ];

    return getHandle(configArr, '工具条配置', defaultProps);
}

// 获取表格配置
function getTableConfig(configArr) {
    const config = getBlockConfig(configArr, '表格配置');

    if (!config) return null;

    const defaultProps = [
        '可选中', 'selectable',
        '分页', 'pagination',
        '序号', 'serialNumber',
    ];

    let result = null;
    config.forEach((item) => {
        let [text] = item;
        const index = defaultProps.indexOf(text);
        if (index > -1) {
            if (!result) result = {};
            result[defaultProps[index + 1]] = true;
        }
    });

    return result
}

// 获取表格列配置
function getColumnConfig(configArr) {
    const config = getBlockConfig(configArr, '表格列配置');

    if (!config) return null;

    let result = null;
    config.forEach((item, i) => {
        let [title, dataIndex = `dataIndex${i}`] = item;

        if (!result) result = [];

        result.push({
            title,
            dataIndex,
        });
    });

    return result;
}

// 获取操作列配置
function getOperatorConfig(configArr) {
    const defaultProps = [
        '修改', '', 'form',
        '删除', 'handleDelete', 'delete',
    ];

    const result = getHandle(configArr, '操作列配置', defaultProps);
    const iconModeIndex = result.findIndex(item => item.text === '图标模式');

    if (iconModeIndex > -1) {
        result.splice(iconModeIndex, 1);
        // 默认图标 question-circle
        result.forEach(item => {
            item.icon = item.icon || 'question-circle';
            item.iconMode = true;
        });
    } else {
        // 非图标模式
        result.forEach(item => item.iconMode = false);
    }

    return result;
}

// 获取表单配置
function getFormConfig(configArr, fromColumn) {
    return getElement(configArr, '表单元素配置', 'f', fromColumn);
}

// 从数据库配置中获取column配置
function getColumnFromDB(dataBaseConfig) {
    // TODO
}

// 从数据库配置中获取form配置
function getFormFromDB(dataBaseConfig) {
    // TODO
}

async function readSwagger(config, baseConfig) {
    const {url, userName, password} = config;
    const httpInstance = url.startsWith('https') ? https : http;
    const auth = 'Basic ' + Buffer.from(userName + ':' + password).toString('base64');
    const request = axios.create({
        httpsAgent: new httpInstance.Agent({
            rejectUnauthorized: false,
        }),
        headers: {
            Authorization: auth,
        },
    });

    return await request.get(url)
        .then((response) => {
            // swagger所能提供的信息 queries columns forms
            const {
                search, // 从search 中获取 quires columns
                modify, // 从modify中获取 forms
            } = baseConfig.ajax;
            const apiDocs = response.data;
            const {paths, definitions} = apiDocs;
            let queries = null;
            let columns = null;
            let forms = null;

            const commonExcludeFields = [
                'SXF-TRACE-ID',
                'pageNum',
                'pageSize',
                'id',
                'token',
            ];

            if (search) {
                let {method, url, excludeFields = []} = search;

                // 获取查询条件
                if (paths[url]) { // 接口有可能不存在
                    excludeFields = [...excludeFields, ...commonExcludeFields];
                    const {parameters} = paths[url][method];

                    parameters.forEach(item => {
                        const {name: field, required, description, in: inType} = item;
                        const label = getShortDescription(description) || field;

                        if (inType === 'query' && !excludeFields.includes(field)) {
                            if (!queries) queries = [];
                            queries.push({
                                field,
                                label,
                                required,
                            })
                        }
                    });

                    // 获取表头
                    const ref = paths[url][method].responses['200'].schema.$ref;
                    let defKey = ref.split('«')[1]
                    defKey = defKey.substr(0, defKey.length - 1);
                    const {properties} = definitions[defKey];

                    Object.entries(properties).forEach(([dataIndex, item]) => {
                        if (!excludeFields.includes(dataIndex)) {
                            const {description} = item;
                            const title = getShortDescription(description) || dataIndex;

                            if (!columns) columns = [];
                            columns.push({
                                title,
                                dataIndex,
                            });
                        }
                    });
                }
            }

            if (modify) {
                // 获取编辑表单信息
                let {method, url, excludeFields = []} = modify;

                // 获取查询条件
                if (paths[url]) { // 接口有可能不存在
                    excludeFields = [...excludeFields, ...commonExcludeFields];
                    const {parameters} = paths[url][method];

                    parameters.forEach(item => {
                        const {in: inType, schema} = item;

                        if (inType === 'body') {
                            const ref = schema.$ref;
                            const refs = ref.split('/');
                            let defKey = refs[refs.length - 1];
                            const {properties} = definitions[defKey];

                            Object.entries(properties).forEach(([field, item]) => {
                                if (!excludeFields.includes(field)) {
                                    const {description, type: sType} = item;
                                    const label = getShortDescription(description) || field;

                                    // FIXME 完善更多类型
                                    let type = 'input';

                                    if (sType === 'array') type = 'select';
                                    if (label.startsWith('是否')) type = 'switch';

                                    if (!forms) forms = [];
                                    forms.push({
                                        type,
                                        label,
                                        field,
                                    });
                                }
                            });
                        }
                    });
                }
            }

            return {
                queries,
                columns,
                forms,
            };
        })
        .catch((error) => {
            // handle error
            console.log(error);
        })
        .finally(function () {
            // always executed
        });
}

function getShortDescription(description) {
    if (!description) return null;

    description = description.trim();

    // FIXME 能否基于第一个特殊字符分割
    const sd = description.split(' ');

    if (sd && sd.length) return sd[0];

    return null;
}

/**
 * 获取各种配置信息
 * */
async function getConfig(configFileContent) {
    const configArray = configFileContent.split('\n');
    const dataBaseConfig = getDataBaseConfig(configArray);
    const baseConfig = getBaseConfig(configArray);
    const pageConfig = getPagesConfig(configArray, baseConfig.moduleName);
    const interfaceConfig = getInterfaceConfig(configArray);
    const toolConfig = getToolConfig(configArray);
    const tableConfig = getTableConfig(configArray);
    const operatorConfig = getOperatorConfig(configArray);

    let columns = getColumnConfig(configArray);
    let queries = getQueryConfig(configArray, true);
    let forms = getFormConfig(configArray, true);


    // 从接口中获取先关信息
    if (interfaceConfig && interfaceConfig.url) {
        console.log(chalk.green('基于Swagger文档'));
        const configFromSwagger = await readSwagger(interfaceConfig, baseConfig);

        queries = configFromSwagger.queries;

        if (configFromSwagger.columns) columns = configFromSwagger.columns;
        if (configFromSwagger.forms) forms = configFromSwagger.forms;

        if (!configFromSwagger.columns) console.log(chalk.yellow('从接口信息中没有获取到表格列配置，将使用配置文件中的《表格列配置》'));
        if (!configFromSwagger.forms) console.log(chalk.yellow('从接口信息中没有获取到表单配置，将使用配置文件中的《表单配置》'));

    } else if (dataBaseConfig && dataBaseConfig.tableName) {
        console.log(chalk.green('基于数据库表'));
        // 从数据库表中获取columns form信息
        const columnConfigFromDB = getColumnFromDB(dataBaseConfig);
        const formConfigFromDB = getFormFromDB(dataBaseConfig);
    } else {
        console.log(chalk.green('基于配置文件'));
    }

    // 如果 forms 为空，将获取所有的columnConfig作为form表单元素，默认type=input
    if (!forms) {
        forms = columns.map(item => ({type: 'input', label: item.title, field: item.dataIndex}));
    }

    return pageConfig.map(item => ({
        fileTypeName: item.typeName,
        filePath: item.filePath, // 保存文件名，完整的路径
        template: item.template, //  获取文件内容的函数
        base: baseConfig,
        pages: pageConfig,
        queries, // 查询条件配置
        tools: toolConfig,  // 工具条配置
        table: tableConfig, // 表格配置
        columns, // 列配置
        operators: operatorConfig, // 操作列配置
        forms, // 表单元素配置
    }));
}

module.exports = getConfig;
