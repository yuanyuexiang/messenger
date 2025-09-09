
import { defineHook } from '@directus/extensions-sdk';
import mqtt from 'mqtt';

// MQTT连接配置
const MQTT_URL = 'mqtt://emqx:1883'; // 如需更改请告知
const MQTT_TOPIC_PREFIX = 'directus';

const client = mqtt.connect(MQTT_URL, {
	clientId: `directus_client_${Math.random().toString(16).slice(3)}`, // 生成唯一客户端ID
});

client.on('connect', () => {
	console.log('Connected to EMQX MQTT broker');
});


export default defineHook(({ action }) => {
	console.log('🚀 Directus MQTT Hook plugin loaded successfully!');
	
	// 需要支持的集合
	const collections = [
		'boutiques',
		'categories',
		'customers',
		// 如有更多集合可在此补充
	];
	
	console.log('📋 Monitoring collections:', collections);

	// 添加通用的 items.create hook 来测试
	console.log('🔗 Registering GENERIC items.create hook');
	action('items.create', async (event) => {
		console.log('🔥 GENERIC CREATE hook triggered!', {
			collection: event.collection,
			key: event.key,
			hasAccountability: !!event.accountability,
			hasServices: !!event.services,
			eventKeys: Object.keys(event)
		});
		console.log('🔍 Full event object:', JSON.stringify(event, null, 2));
	});

	collections.forEach((collection) => {
		console.log(`🔗 Registering CREATE hook for: items.create.${collection}`);
		// 创建 - 使用 ItemsService 查询完整记录（含 user_created）
		action(`items.create.${collection}`, async (event) => {
			console.log(`🔥 CREATE hook triggered for ${collection}! Key: ${event.key}`);
			console.log(`🔍 Event keys for ${collection}:`, Object.keys(event));
			
			const { payload, key, accountability, services } = event;
			
			try {
				if (!services) {
					console.log(`⚠️ No services available for ${collection}, sending basic payload`);
					client.publish(
						`${MQTT_TOPIC_PREFIX}/${collection}/unknown/create`,
						JSON.stringify({ payload, key })
					);
					return;
				}
				
				const { ItemsService } = services;
				const itemsService = new ItemsService(collection, { accountability });
				
				// 查询刚创建的记录，获取完整信息（包括 user_created）
				const item = await itemsService.readOne(key, { fields: ['*'] });
				const userID = item.user_created ? String(item.user_created) : 'unknown';
				console.log(`[CREATE][RAW] ${collection}:`, JSON.stringify(payload, null, 2));
				console.log(`[CREATE][FULL] ${collection}:`, JSON.stringify(item, null, 2));
				console.log(`[CREATE][USER] ${collection}: record.user_created = ${userID}`);
				client.publish(
					`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/create`,
					JSON.stringify({ payload, item, user_created: item.user_created })
				);
			} catch (error) {
				console.error(`[CREATE][ERROR] ${collection}:`, error);
				// 降级处理：使用当前操作用户
				const userID = accountability?.user ? String(accountability.user) : 'unknown';
				client.publish(
					`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/create`,
					JSON.stringify(payload)
				);
			}
		});

		console.log(`🔗 Registering UPDATE hook for: items.update.${collection}`);
		// 更新 - 使用 ItemsService 查询记录的 user_created
		action(`items.update.${collection}`, async ({ payload, keys, accountability, services }) => {
			console.log(`🔥 UPDATE hook triggered for ${collection}! Keys:`, keys);
			try {
				const { ItemsService } = services;
				const itemsService = new ItemsService(collection, { accountability });
				
				const keyArray = Array.isArray(keys) ? keys : [keys];
				
				// 为每个ID查询记录并发送MQTT消息
				for (const key of keyArray) {
					try {
						const item = await itemsService.readOne(key, { fields: ['user_created'] });
						const userID = item.user_created ? String(item.user_created) : 'unknown';
						console.log(`[UPDATE][RAW] ${collection}:`, JSON.stringify({ keys: key, payload }, null, 2));
						console.log(`[UPDATE][USER] ${collection}: record.user_created = ${userID}`);
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/update`,
							JSON.stringify({ keys: key, payload, user_created: item.user_created })
						);
					} catch (itemError) {
						console.error(`[UPDATE][ITEM_ERROR] ${collection} key ${key}:`, itemError);
						// 降级处理：使用当前操作用户
						const userID = accountability?.user ? String(accountability.user) : 'unknown';
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/update`,
							JSON.stringify({ keys: key, payload })
						);
					}
				}
			} catch (error) {
				console.error(`[UPDATE][ERROR] ${collection}:`, error);
				// 降级处理：使用当前操作用户
				const userID = accountability?.user ? String(accountability.user) : 'unknown';
				client.publish(
					`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/update`,
					JSON.stringify({ keys, payload })
				);
			}
		});

		console.log(`🔗 Registering DELETE hook for: items.delete.${collection}`);
		// 删除 - 使用 ItemsService 查询记录的 user_created
		action(`items.delete.${collection}`, async ({ keys, payload, accountability, services }) => {
			console.log(`🔥 DELETE hook triggered for ${collection}! Keys:`, keys);
			try {
				const { ItemsService } = services;
				const itemsService = new ItemsService(collection, { accountability });
				
				const keyArray = Array.isArray(keys) ? keys : [keys];
				
				// 为每个ID查询记录并发送MQTT消息
				for (const key of keyArray) {
					try {
						const item = await itemsService.readOne(key, { fields: ['user_created'] });
						const userID = item.user_created ? String(item.user_created) : 'unknown';
						console.log(`[DELETE][RAW] ${collection}:`, JSON.stringify({ keys: key, payload }, null, 2));
						console.log(`[DELETE][USER] ${collection}: record.user_created = ${userID}`);
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/delete`,
							JSON.stringify({ keys: key, payload, user_created: item.user_created })
						);
					} catch (itemError) {
						console.error(`[DELETE][ITEM_ERROR] ${collection} key ${key}:`, itemError);
						// 降级处理：使用当前操作用户
						const userID = accountability?.user ? String(accountability.user) : 'unknown';
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/delete`,
							JSON.stringify({ keys: key, payload })
						);
					}
				}
			} catch (error) {
				console.error(`[DELETE][ERROR] ${collection}:`, error);
				// 降级处理：使用当前操作用户
				const userID = accountability?.user ? String(accountability.user) : 'unknown';
				client.publish(
					`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/delete`,
					JSON.stringify({ keys, payload })
				);
			}
		});
	});
});
