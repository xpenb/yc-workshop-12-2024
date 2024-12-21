// https://cloud.yandex.com/en/docs/functions/concepts/function-invoke

export type HTTPMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';

export type IAMToken = {
	access_token: string;
	expires_in: number;
	token_type: 'Bearer';
};

export interface IEvent {
	httpMethod?: HTTPMethod;
	headers: Record<string, string | undefined>;
	multiValueHeaders?: Record<string, string[] | undefined>;
	queryStringParameters?: Record<string, string | undefined>;
	multiValueQueryStringParameters?: Record<string, string[] | undefined>;
	requestContext?: {
		identity: {
			sourceIp: string;
			userAgent: string;
		};
		httpMethod: HTTPMethod;
		requestId: string;
		requestTime: string;
		requestTimeEpoch: number;
	};
	// If the function is called with the Content-Type: application/json header, the contents of body stays in the original format (parameter value isBase64Encoded: false).
	body: string; // data can be Base64-encoded, then the "isBase64Encoded" property will be true
	isBase64Encoded?: boolean;

	// Триггер для Message Queue
	messages?: {
		event_metadata: {
			event_id: string,
			event_type: string,
			created_at: string,
			cloud_id: string,
			folder_id: string,
		},
		details: {
			queue_id: string,
			message: {
				message_id: string,
				md5_of_body: string,
				body: string,
				attributes: Record<string, string>,
				message_attributes: Record<string, {
					data_type: string
					string_value: string
				}>
				md5_of_message_attributes: string
			}
		}
	}[]
}

export interface IContext {
	requestId: string;
	functionName: string;
	functionVersion: string;
	memoryLimitInMB: string;
	token?: IAMToken; // if you use serviceAccount, then you will receive IAM token
}

export interface IResponse {
	statusCode?: number;
	headers?: Record<string, string>;
	multiValueHeaders?: Record<string, string[]>;
	body?: string;
	isBase64Encoded?: boolean;
}

export type Handler = (event: IEvent, context: IContext) => IResponse | Promise<IResponse>;
