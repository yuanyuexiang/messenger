import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ filter, action }) => {


	// 移除 filter 钩子，避免类型错误


	action('items.create', ({ payload }) => {
		console.log('[CREATE][RAW]:', JSON.stringify(payload, null, 2));
	});
});
