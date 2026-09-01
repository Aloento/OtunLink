#!/usr/bin/env node

/**
 * CLI 脚本：使用配置的 SMTP 发送邮件
 * 使用方式: node send-email.mjs --to <recipient> --subject <subject> --html <html-file> [--text <text>]
 *
 * 环境变量来自 .dev.vars，需要配置 SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM
 */

import * as fs from 'fs';
import * as path from 'path';

interface EnvConfig {
    MAIL_FROM?: string;
    SMTP_HOST?: string;
    SMTP_PORT?: string;
    SMTP_USER?: string;
    SMTP_PASS?: string;
    SMTP_SECURE?: string;
    SMTP_STARTTLS?: string;
    SMTP_AUTH?: string;
}

function loadDevVars(filePath: string): EnvConfig {
    const content = fs.readFileSync(filePath, 'utf-8');
    const config: EnvConfig = {};

    content.split('\n').forEach((line) => {
        line = line.trim();
        // 跳过注释和空行
        if (!line || line.startsWith('#')) return;

        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            // 去除引号
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (
                key.startsWith('MAIL_') ||
                key.startsWith('SMTP_')
            ) {
                config[key as keyof EnvConfig] = cleanValue;
            }
        }
    });

    return config;
}

async function sendEmailViaSMTP(
    to: string,
    subject: string,
    html: string | null,
    text: string | null,
    config: EnvConfig,
): Promise<void> {
    const { createConnection } = await import('net');
    const { promisify } = await import('util');

    const host = config.SMTP_HOST || '';
    const port = parseInt(config.SMTP_PORT || '465', 10);
    const user = config.SMTP_USER || '';
    const pass = config.SMTP_PASS || '';
    const from = config.MAIL_FROM || user;
    const secure = config.SMTP_SECURE === 'true' || port === 465;

    if (!host || !user || !pass) {
        throw new Error('缺少必要的 SMTP 配置: SMTP_HOST、SMTP_USER、SMTP_PASS');
    }

    console.log(`📧 发送邮件配置:`);
    console.log(`   主机: ${host}:${port}`);
    console.log(`   发送人: ${from}`);
    console.log(`   收件人: ${to}`);
    console.log(`   主题: ${subject}`);
    console.log(`   加密: ${secure ? 'TLS (465)' : 'STARTTLS (587)'}`);

    // 使用 worker-mailer 兼容方法，但这不会在 Node 中工作
    // 所以我们需要使用 nodemailer 或直接 SMTP 实现

    // 检查是否安装了 nodemailer
    try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
            host,
            port,
            secure,
            auth: {
                user,
                pass,
            },
            logger: false,
            debug: false,
        });

        const message = {
            from,
            to,
            subject,
            text: text || undefined,
            html: html || undefined,
        };

        console.log('\n⏳ 正在发送邮件...');
        const result = await transporter.sendMail(message);
        console.log('✅ 邮件发送成功!');
        console.log(`   消息 ID: ${result.messageId}`);
        console.log(`   响应: ${result.response}`);
    } catch (err) {
        if (
            err instanceof Error &&
            err.message.includes('Cannot find module')
        ) {
            console.error('❌ 错误: 未安装 nodemailer');
            console.error('请运行: pnpm add -D nodemailer @types/nodemailer');
            process.exit(1);
        }
        throw err;
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const params: Record<string, string> = {};

    // 解析命令行参数
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i]?.replace(/^--/, '');
        const value = args[i + 1];
        if (key && value) {
            params[key] = value;
        }
    }

    // 检查必要的参数
    if (!params.to) {
        console.error('❌ 缺少必要参数: --to <recipient>');
        console.error('用法: npx tsx send-email.ts --to <recipient> --subject <subject> --html <html-file>');
        process.exit(1);
    }

    if (!params.subject) {
        console.error('❌ 缺少必要参数: --subject <subject>');
        process.exit(1);
    }

    // 加载 HTML 内容
    let htmlContent: string | null = null;
    if (params.html) {
        const htmlPath = path.resolve(params.html);
        if (fs.existsSync(htmlPath)) {
            htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        } else if (params.html.length < 500) {
            // 如果参数很短，可能就是 HTML 内容
            htmlContent = params.html;
        } else {
            console.error(`❌ HTML 文件不存在: ${params.html}`);
            process.exit(1);
        }
    }

    // 加载文本内容（可选）
    const textContent = params.text || null;

    // 加载 .dev.vars 配置
    const devVarsPath = path.join(process.cwd(), '.dev.vars');
    if (!fs.existsSync(devVarsPath)) {
        console.error(`❌ 找不到 .dev.vars 文件: ${devVarsPath}`);
        process.exit(1);
    }

    const config = loadDevVars(devVarsPath);

    try {
        await sendEmailViaSMTP(
            params.to,
            params.subject,
            htmlContent,
            textContent,
            config,
        );
    } catch (error) {
        console.error('❌ 发送失败:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('❌ 错误:', err);
    process.exit(1);
});
