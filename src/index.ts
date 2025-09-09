import { defineHook } from '@directus/extensions-sdk';
import mqtt from 'mqtt';

// MQTT连接配置
const MQTT_URL = 'mqtt://emqx:1883';
const MQTT_TOPIC_PREFIX = 'directus';

const client = mqtt.connect(MQTT_URL, {
	clientId: `directus_client_${Math.random().toString(16).slice(3)}`,
});

client.on('connect', () => {
	console.log('Connected to EMQX MQTT broker');
});

export default defineHook(({ action }, context) => {
	console.log('🔍 Available context keys:', Object.keys(context || {}));
	console.log('🚀 Directus MQTT Hook plugin loaded successfully!');
	
	// 需要支持的集合
	const collections = [
		'boutiques',
		'categories',
		'customers',
	];
	
	console.log('📋 Monitoring collections:', collections);

	// === CREATE Hook - 使用数据库查询获取真实的 user_created ===
	console.log('🔗 Registering *.items.create hook with DATABASE QUERY');
	action('*.items.create', async (event, meta) => {
		const { collection, payload, key } = event;
		
		// 只处理我们关心的集合
		if (!collections.includes(collection)) {
			return;
		}
		
		console.log(`🔥 CREATE hook triggered for ${collection}! Key: ${key}`);
		console.log(`[CREATE][FULL_EVENT] ${collection}:`, JSON.stringify(event, null, 2));
		console.log(`[CREATE][META] ${collection}:`, JSON.stringify(meta, null, 2));
		
		let userID = 'unknown';
		
		// 尝试使用 context 中的 services 查询数据库获取完整记录
		if ((context as any)?.services?.ItemsService) {
			try {
				console.log(`🔍 Querying ${collection} record ${key} to get user_created...`);
				const ItemsService = (context as any).services.ItemsService;
				
				// 延迟一小段时间确保记录已写入
				setTimeout(async () => {
					try {
						const itemsService = new ItemsService(collection, {
							accountability: meta?.accountability,
							schema: (context as any)?.getSchema ? await (context as any).getSchema() : undefined
						});
						
						const item = await itemsService.readOne(key, { fields: ['user_created'] });
						if (item?.user_created) {
							userID = String(item.user_created);
							console.log(`✅🎯 Found REAL user_created from database: ${userID}`);
						} else {
							console.log(`❌🎯 No user_created field in database record`);
							userID = meta?.accountability?.user ? String(meta.accountability.user) : 'unknown';
						}
						
						const mqttMessage = {
							action: 'create',
							collection: collection,
							key: key,
							payload: payload,
							timestamp: new Date().toISOString(),
							user_created: userID
						};
						
						console.log(`📤🎯 Publishing MQTT message for ${collection}/${userID}/create`);
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/create`,
							JSON.stringify(mqttMessage)
						);
					} catch (dbError) {
						console.error(`❌ Database query failed:`, dbError);
						userID = meta?.accountability?.user ? String(meta.accountability.user) : 'unknown';
						
						const mqttMessage = {
							action: 'create',
							collection: collection,
							key: key,
							payload: payload,
							timestamp: new Date().toISOString(),
							user_created: userID
						};
						
						console.log(`📤⚠️ Publishing MQTT message for ${collection}/${userID}/create (FALLBACK)`);
						client.publish(
							`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/create`,
							JSON.stringify(mqttMessage)
						);
					}
				}, 100);
				
				return;
			} catch (error) {
				console.error(`❌ Services not available:`, error);
			}
		}
		
		// 如果无法查询数据库，使用当前操作用户作为fallback
		if (meta?.accountability?.user) {
			userID = String(meta.accountability.user);
			console.log(`✅ Found user in meta.accountability: ${userID}`);
		} else {
			console.log(`❌ No user information found, using unknown`);
		}
		
		const mqttMessage = {
			action: 'create',
			collection: collection,
			key: key,
			payload: payload,
			timestamp: new Date().toISOString(),
			user_created: userID
		};
		
		console.log(`📤 Publishing MQTT message for ${collection}/${userID}/create (IMMEDIATE)`);
		client.publish(
			`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/create`,
			JSON.stringify(mqttMessage)
		);
	});

	// === UPDATE Hook - 使用数据库查询获取真实的 user_created ===
	console.log('🔗 Registering items.update hook with DATABASE QUERY');
	action('items.update', async (event, meta) => {
		const { collection, payload, keys } = event;
		
		if (!collections.includes(collection)) {
			return;
		}
		
		console.log(`🔥 UPDATE hook triggered for ${collection}! Keys:`, keys);
		console.log(`[UPDATE][FULL_EVENT] ${collection}:`, JSON.stringify(event, null, 2));
		
		const processKey = async (key: any) => {
			let userID = 'unknown';
			
			if ((context as any)?.services?.ItemsService) {
				try {
					console.log(`🔍 Querying ${collection} record ${key} for UPDATE...`);
					const ItemsService = (context as any).services.ItemsService;
					
					const itemsService = new ItemsService(collection, {
						accountability: meta?.accountability,
						schema: (context as any)?.getSchema ? await (context as any).getSchema() : undefined
					});
					
					const item = await itemsService.readOne(key, { fields: ['user_created'] });
					if (item?.user_created) {
						userID = String(item.user_created);
						console.log(`✅🎯 Found REAL user_created for UPDATE: ${userID}`);
					} else {
						userID = meta?.accountability?.user ? String(meta.accountability.user) : 'unknown';
					}
				} catch (dbError) {
					console.error(`❌ Database query failed for UPDATE:`, dbError);
					userID = meta?.accountability?.user ? String(meta.accountability.user) : 'unknown';
				}
			} else {
				userID = meta?.accountability?.user ? String(meta.accountability.user) : 'unknown';
			}
			
			const mqttMessage = {
				action: 'update',
				collection: collection,
				key: key,
				keys: keys,
				payload: payload,
				timestamp: new Date().toISOString(),
				user_created: userID
			};
			
			console.log(`📤🎯 Publishing MQTT message for ${collection}/${userID}/update`);
			client.publish(
				`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/update`,
				JSON.stringify(mqttMessage)
			);
		};
		
		if (Array.isArray(keys)) {
			for (const key of keys) {
				await processKey(key);
			}
		} else {
			await processKey(keys);
		}
	});

	// === DELETE Hook - 优先使用当前操作用户 ===
	console.log('🔗 Registering items.delete hook with DATABASE QUERY');
	action('items.delete', async (event, meta) => {
		const { collection, keys, payload } = event;
		
		if (!collections.includes(collection)) {
			return;
		}
		
		console.log(`🔥 DELETE hook triggered for ${collection}! Keys:`, keys);
		console.log(`[DELETE][FULL_EVENT] ${collection}:`, JSON.stringify(event, null, 2));
		
		const processKey = async (key: any) => {
			let userID = 'unknown';
			
			// 对于DELETE，优先使用当前操作用户（记录可能已删除）
			if (meta?.accountability?.user) {
				userID = String(meta.accountability.user);
				console.log(`✅ Found user in meta.accountability for DELETE: ${userID}`);
			} else {
				console.log(`❌ No user information found for DELETE`);
			}
			
			const mqttMessage = {
				action: 'delete',
				collection: collection,
				key: key,
				keys: keys,
				payload: payload || {},
				timestamp: new Date().toISOString(),
				user_created: userID
			};
			
			console.log(`📤🎯 Publishing MQTT message for ${collection}/${userID}/delete`);
			client.publish(
				`${MQTT_TOPIC_PREFIX}/${collection}/${userID}/delete`,
				JSON.stringify(mqttMessage)
			);
		};
		
		if (Array.isArray(keys)) {
			for (const key of keys) {
				await processKey(key);
			}
		} else {
			await processKey(keys);
		}
	});
});
