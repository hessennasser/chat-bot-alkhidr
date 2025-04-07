'use client';
import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
	Edit2,
	Send,
	MessageSquare,
	X,
	Check,
	Trash2,
	Plus,
	Moon,
	Sun,
	Menu,
	ChevronRight,
	MessageCircle,
} from 'lucide-react';

// Define types for our data
interface Message {
	id: number | string;
	sender: 'user' | 'bot';
	text: string;
	isComplete: boolean;
	timestamp: Date;
	carProps?: CarProp[];
	sqlQuery?: string;
}

interface CarProp {
	emoji: string;
	key: string;
	value: string;
}

interface Conversation {
	id: string;
	title: string;
	createdAt?: string;
	updatedAt?: string;
}

interface ConversationHistoryMessage {
	id: string;
	userMessage: string;
	botResponse: string;
	createdAt: string;
}

interface MessageChunkData {
	chunk: string;
	conversationId: string;
	isComplete: boolean;
}

interface MessageCompleteData {
	message:
		| string
		| { carProps: CarProp[]; chatReply: string; sqlQuery: string };
	conversationId: string;
	isComplete: boolean;
}

// Mock data for testing - replace with your actual values
const userId = 52;
const authToken =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NTIsImVtYWlsIjoiaGVzc2VubmFzc2VyMzU3OUBnbWFpbC5jb20iLCJhY3RpdmUiOnRydWUsImlhdCI6MTc0Mzk5NTUyOSwiZXhwIjoxNzQzOTk5MTI5fQ.5dr7vs9qFk7NS_ghSfeI1FDO4MFiacRmr6Dd--qsZ0I';

const ChatComponent = () => {
	const [connected, setConnected] = useState<boolean>(false);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeConversation, setActiveConversation] = useState<string | null>(
		null,
	);
	const [message, setMessage] = useState<string>('');
	const [messages, setMessages] = useState<Message[]>([]);
	const [isTyping, setIsTyping] = useState<boolean>(false);
	const [editingConversationId, setEditingConversationId] = useState<
		string | null
	>(null);
	const [editingTitle, setEditingTitle] = useState<string>('');
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
	const [darkMode, setDarkMode] = useState<boolean>(false);

	const socketRef = useRef<any>(null);
	const currentResponseRef = useRef<string>('');
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const processingMessageRef = useRef<boolean>(false);

	// Initialize dark mode from user preference
	useEffect(() => {
		// Check if user prefers dark mode
		const prefersDarkMode = window.matchMedia(
			'(prefers-color-scheme: dark)',
		).matches;
		setDarkMode(prefersDarkMode);

		// Apply dark mode class to document
		if (prefersDarkMode) {
			document.documentElement.classList.add('dark');
		}
	}, []);

	// Toggle dark mode
	const toggleDarkMode = () => {
		setDarkMode(!darkMode);
		if (darkMode) {
			document.documentElement.classList.remove('dark');
		} else {
			document.documentElement.classList.add('dark');
		}
	};

	// Initialize socket connection
	useEffect(() => {
		// Create socket instance
		const socket = io('http://localhost:3001/chat', {
			transports: ['websocket', 'polling'],
			autoConnect: false,
			auth: {
				token: authToken,
			},
		});

		// Set socket reference
		socketRef.current = socket;

		// Set up event listeners
		socket.on('connect', () => {
			console.log('Connected to chat server');
			setConnected(true);
		});

		socket.on('disconnect', () => {
			console.log('Disconnected from chat server');
			setConnected(false);
		});

		interface SocketConnectionError {
			message: string;
			description?: string;
			type?: string;
		}

		socket.on('connect_error', (error: SocketConnectionError) => {
			console.error('Connection error:', error);
			setConnected(false);
		});

		socket.on('message_chunk', (data: MessageChunkData) => {
			const { chunk, conversationId, isComplete } = data;

			// Only process if it's our active conversation
			if (conversationId === activeConversation) {
				// Update the current response
				currentResponseRef.current += chunk;

				// Update messages with the in-progress response
				setMessages(prevMessages => {
					const updatedMessages = [...prevMessages];
					const lastMessageIndex = updatedMessages.length - 1;

					// If we already have a bot message that's in progress, update it
					if (
						lastMessageIndex >= 0 &&
						updatedMessages[lastMessageIndex].sender === 'bot' &&
						updatedMessages[lastMessageIndex].isComplete === false
					) {
						updatedMessages[lastMessageIndex].text = currentResponseRef.current;
						return updatedMessages;
					} else if (!processingMessageRef.current) {
						// Otherwise add a new bot message if we're not already processing
						processingMessageRef.current = true;
						updatedMessages.push({
							id: Date.now(),
							sender: 'bot',
							text: currentResponseRef.current,
							isComplete: false,
							timestamp: new Date(),
						});
						return updatedMessages;
					}

					return prevMessages;
				});

				// Show typing indicator
				setIsTyping(true);
			}
		});

		socket.on('message_complete', (data: MessageCompleteData) => {
			const { message: responseMessage, conversationId, isComplete } = data;

			// Only process if it's our active conversation
			if (conversationId === activeConversation) {
				// Reset the current response
				currentResponseRef.current = '';
				processingMessageRef.current = false;

				// Parse the message based on its type
				let messageText = '';
				let carProps: CarProp[] | undefined = undefined;
				let sqlQuery: string | undefined = undefined;

				try {
					// First, check if the message is a JSON string that needs to be parsed
					if (typeof responseMessage === 'string') {
						try {
							// Try to parse the string as JSON
							const parsedMessage = JSON.parse(responseMessage);

							// If parsing succeeded and it has the expected structure
							if (parsedMessage && typeof parsedMessage === 'object') {
								messageText = parsedMessage.chatReply || '';
								carProps = parsedMessage.carProps;
								sqlQuery = parsedMessage.sqlQuery;
							} else {
								// If it's not the expected structure, just use the string
								messageText = responseMessage;
							}
						} catch (e) {
							// If parsing fails, just use the string as is
							messageText = responseMessage;
						}
					} else if (responseMessage && typeof responseMessage === 'object') {
						// If it's already an object
						messageText = responseMessage.chatReply || '';
						carProps = responseMessage.carProps;
						sqlQuery = responseMessage.sqlQuery;
					}

					// Update messages with the complete response
					setMessages(prevMessages => {
						const updatedMessages = [...prevMessages];
						const lastMessageIndex = updatedMessages.length - 1;

						// If we already have a bot message that's in progress, mark it complete
						if (
							lastMessageIndex >= 0 &&
							updatedMessages[lastMessageIndex].sender === 'bot' &&
							updatedMessages[lastMessageIndex].isComplete === false
						) {
							updatedMessages[lastMessageIndex].text = messageText;
							updatedMessages[lastMessageIndex].isComplete = true;
							updatedMessages[lastMessageIndex].carProps = carProps;
							updatedMessages[lastMessageIndex].sqlQuery = sqlQuery;
						} else {
							// Otherwise add a new complete bot message
							updatedMessages.push({
								id: Date.now(),
								sender: 'bot',
								text: messageText,
								isComplete: true,
								timestamp: new Date(),
								carProps,
								sqlQuery,
							});
						}

						return updatedMessages;
					});

					// Hide typing indicator
					setIsTyping(false);
				} catch (error) {
					console.error('Error processing message:', error);
					setIsTyping(false);
				}
			}
		});

		socket.on('error', (error: { message: string }) => {
			console.error('Received error:', error.message);
			// Show error notification
			alert(`Error: ${error.message}`);
			// Hide typing indicator
			setIsTyping(false);
			processingMessageRef.current = false;
		});

		// Connect with auth token
		if (authToken) {
			socket.connect();
		}

		// Cleanup on unmount
		return () => {
			socket.disconnect();
		};
	}, [authToken, activeConversation]);

	// Load conversations on component mount
	useEffect(() => {
		if (authToken) {
			fetchUserConversations();
		}
	}, [authToken]);

	// Join conversation when active conversation changes
	useEffect(() => {
		if (socketRef.current && activeConversation) {
			// Leave previous conversations
			conversations.forEach(conv => {
				socketRef.current?.emit('leave_conversation', {
					conversationId: conv.id,
				});
			});

			// Join the active conversation
			socketRef.current.emit('join_conversation', {
				conversationId: activeConversation,
			});

			// Clear messages when changing conversations
			setMessages([]);
			processingMessageRef.current = false;

			// Load conversation history
			fetchConversationHistory(activeConversation);

			// Close mobile menu when conversation changes
			setIsMobileMenuOpen(false);
		}
	}, [activeConversation, conversations]);

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, isTyping]);

	// Fetch conversation history
	const fetchConversationHistory = async (conversationId: string) => {
		try {
			const response = await fetch(
				`http://localhost:3001/api/v1/chat-bot/conversations/${conversationId}`,
				{
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (
				result.data &&
				result.data.conversation &&
				result.data.conversation.messages
			) {
				// Transform messages to our format
				const historyMessages = result.data.conversation.messages.flatMap(
					(msg: ConversationHistoryMessage) => [
						{
							id: `user-${msg.id}`,
							sender: 'user' as const,
							text: msg.userMessage,
							isComplete: true,
							timestamp: new Date(msg.createdAt),
						},
						{
							id: `bot-${msg.id}`,
							sender: 'bot' as const,
							text: msg.botResponse,
							isComplete: true,
							timestamp: new Date(msg.createdAt),
						},
					],
				);

				setMessages(historyMessages);
			}
		} catch (error) {
			console.error('Error fetching conversation history:', error);
		}
	};

	// Fetch user conversations
	const fetchUserConversations = async () => {
		try {
			const response = await fetch(
				'http://localhost:3001/api/v1/chat-bot/conversations',
				{
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.data && result.data.conversations) {
				setConversations(result.data.conversations);

				// Set active conversation if not already set
				if (!activeConversation && result.data.conversations.length > 0) {
					setActiveConversation(result.data.conversations[0].id);
				}
			}
		} catch (error) {
			console.error('Error fetching user conversations:', error);
		}
	};

	// Create a new conversation
	const createNewConversation = async () => {
		try {
			const response = await fetch(
				'http://localhost:3001/api/v1/chat-bot/conversations',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`,
					},
					body: JSON.stringify({
						title: 'New Conversation',
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.data && result.data.conversation) {
				// Add new conversation to list
				setConversations(prev => [...prev, result.data.conversation]);

				// Set as active conversation
				setActiveConversation(result.data.conversation.id);
			}
		} catch (error) {
			console.error('Error creating conversation:', error);
		}
	};

	// Update conversation title
	const updateConversationTitle = async (
		conversationId: string,
		newTitle: string,
	) => {
		try {
			const response = await fetch(
				`http://localhost:3001/api/v1/chat-bot/conversations/${conversationId}`,
				{
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${authToken}`,
					},
					body: JSON.stringify({
						title: newTitle,
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.data && result.data.conversation) {
				// Update conversation in list
				setConversations(prev =>
					prev.map(conv =>
						conv.id === conversationId ? { ...conv, title: newTitle } : conv,
					),
				);
			}
		} catch (error) {
			console.error('Error updating conversation title:', error);
		}
	};

	// Delete conversation
	const deleteConversation = async (conversationId: string) => {
		if (!window.confirm('Are you sure you want to delete this conversation?')) {
			return;
		}

		try {
			const response = await fetch(
				`http://localhost:3001/api/v1/chat-bot/conversations/${conversationId}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Remove conversation from list
			setConversations(prev => prev.filter(conv => conv.id !== conversationId));

			// If active conversation was deleted, set a new active conversation
			if (activeConversation === conversationId) {
				const remainingConversations = conversations.filter(
					conv => conv.id !== conversationId,
				);
				if (remainingConversations.length > 0) {
					setActiveConversation(remainingConversations[0].id);
				} else {
					setActiveConversation(null);
				}
			}
		} catch (error) {
			console.error('Error deleting conversation:', error);
		}
	};

	// Start editing conversation title
	const startEditingTitle = (conversation: Conversation) => {
		setEditingConversationId(conversation.id);
		setEditingTitle(conversation.title);
	};

	// Save edited conversation title
	const saveEditedTitle = () => {
		if (editingConversationId && editingTitle.trim()) {
			updateConversationTitle(editingConversationId, editingTitle);
			setEditingConversationId(null);
		}
	};

	// Cancel editing conversation title
	const cancelEditingTitle = () => {
		setEditingConversationId(null);
	};

	// Send a message
	const sendMessage = () => {
		if (!message.trim() || !activeConversation || !socketRef.current) return;

		// Add user message to the list
		setMessages(prev => [
			...prev,
			{
				id: Date.now(),
				sender: 'user',
				text: message,
				isComplete: true,
				timestamp: new Date(),
			},
		]);

		// Send message via socket
		socketRef.current.emit('send_message', {
			message,
			conversationId: activeConversation,
			userId,
		});

		// Clear input
		setMessage('');
	};

	// Toggle mobile menu
	const toggleMobileMenu = () => {
		setIsMobileMenuOpen(!isMobileMenuOpen);
	};

	return (
		<div className='flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200'>
			{/* Mobile menu button */}
			<button
				onClick={toggleMobileMenu}
				className='md:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-full shadow-md dark:shadow-gray-800/20'>
				<Menu className='h-6 w-6 text-purple-600 dark:text-purple-400' />
			</button>

			{/* Sidebar */}
			<div
				className={`${
					isMobileMenuOpen ? 'fixed inset-0 z-40' : 'hidden'
				} md:flex md:relative md:w-80 md:flex-shrink-0 bg-white dark:bg-gray-800 shadow-lg transition-colors duration-200`}>
				<div className='flex flex-col h-full'>
					<div className='p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center'>
						<div className='flex items-center space-x-2'>
							<MessageCircle className='h-6 w-6 text-purple-600 dark:text-purple-400' />
							<h2 className='text-xl font-semibold text-gray-800 dark:text-white'>
								Conversations
							</h2>
						</div>
						<div className='flex items-center space-x-2'>
							<button
								onClick={toggleDarkMode}
								className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'>
								{darkMode ? (
									<Sun className='h-5 w-5 text-yellow-500' />
								) : (
									<Moon className='h-5 w-5 text-gray-600' />
								)}
							</button>
							<button
								onClick={createNewConversation}
								disabled={!connected}
								className='p-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 rounded-full hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
								<Plus className='h-5 w-5' />
							</button>
						</div>
					</div>

					<div className='overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600'>
						{conversations.length === 0 ? (
							<div className='p-8 text-center'>
								<div className='bg-gray-100 dark:bg-gray-700 p-4 rounded-lg inline-block mb-4'>
									<MessageSquare className='h-8 w-8 text-purple-500 dark:text-purple-400 mx-auto' />
								</div>
								<p className='text-gray-600 dark:text-gray-400'>
									No conversations yet. Start a new one!
								</p>
							</div>
						) : (
							<ul className='divide-y divide-gray-100 dark:divide-gray-700'>
								{conversations.map(conversation => (
									<li
										key={conversation.id}
										className={`transition-colors duration-150 ${
											activeConversation === conversation.id
												? 'bg-purple-50 dark:bg-gray-700/50 border-l-4 border-purple-500 dark:border-purple-400'
												: 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
										}`}>
										<div className='px-4 py-3'>
											{editingConversationId === conversation.id ? (
												<div className='flex items-center'>
													<input
														type='text'
														value={editingTitle}
														onChange={e => setEditingTitle(e.target.value)}
														className='flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400'
														autoFocus
													/>
													<button
														onClick={saveEditedTitle}
														className='ml-2 p-1.5 text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md'>
														<Check className='h-4 w-4' />
													</button>
													<button
														onClick={cancelEditingTitle}
														className='ml-1 p-1.5 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md'>
														<X className='h-4 w-4' />
													</button>
												</div>
											) : (
												<div className='flex items-center justify-between'>
													<div
														onClick={() =>
															setActiveConversation(conversation.id)
														}
														className='flex-1 cursor-pointer group'>
														<div className='flex items-center'>
															<ChevronRight
																className={`h-4 w-4 mr-1 text-gray-400 dark:text-gray-500 transition-transform ${
																	activeConversation === conversation.id
																		? 'rotate-90'
																		: 'group-hover:translate-x-1'
																}`}
															/>
															<div className='font-medium text-gray-800 dark:text-gray-200 truncate'>
																{conversation.title}
															</div>
														</div>
														{conversation.updatedAt && (
															<div className='text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5'>
																{new Date(
																	conversation.updatedAt,
																).toLocaleDateString()}
															</div>
														)}
													</div>
													<div className='flex opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity'>
														<button
															onClick={() => startEditingTitle(conversation)}
															className='p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md'>
															<Edit2 className='h-4 w-4' />
														</button>
														<button
															onClick={() =>
																deleteConversation(conversation.id)
															}
															className='ml-1 p-1.5 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded-md'>
															<Trash2 className='h-4 w-4' />
														</button>
													</div>
												</div>
											)}
										</div>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Mobile close button */}
					<div className='md:hidden p-4 border-t border-gray-200 dark:border-gray-700'>
						<button
							onClick={toggleMobileMenu}
							className='w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors'>
							Close Menu
						</button>
					</div>
				</div>
			</div>

			{/* Chat content */}
			<div className='flex-1 flex flex-col'>
				{/* Chat header */}
				{activeConversation && (
					<div className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between shadow-sm transition-colors duration-200'>
						<h2 className='text-lg font-semibold text-gray-800 dark:text-white flex items-center'>
							<MessageCircle className='h-5 w-5 mr-2 text-purple-600 dark:text-purple-400' />
							{conversations.find(c => c.id === activeConversation)?.title ||
								'Chat'}
						</h2>
						<div className='flex items-center'>
							<span
								className={`h-2.5 w-2.5 rounded-full mr-2 ${
									connected
										? 'bg-green-500 dark:bg-green-400'
										: 'bg-red-500 dark:bg-red-400'
								}`}></span>
							<span className='text-sm text-gray-600 dark:text-gray-300'>
								{connected ? 'Connected' : 'Disconnected'}
							</span>
						</div>
					</div>
				)}

				{/* Messages container */}
				<div className='flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 transition-colors duration-200 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700'>
					{messages.length === 0 && !isTyping ? (
						<div className='flex flex-col items-center justify-center h-full text-center'>
							<div className='bg-gradient-to-r from-purple-500 to-indigo-500 p-5 rounded-full shadow-lg mb-4'>
								<MessageSquare className='w-10 h-10 text-white' />
							</div>
							<p className='mt-4 text-gray-600 dark:text-gray-400 text-lg'>
								No messages yet. Start a conversation!
							</p>
							<p className='mt-2 text-gray-500 dark:text-gray-500 max-w-md'>
								Ask about cars, specifications, or anything else you'd like to
								know.
							</p>
						</div>
					) : (
						<div className='space-y-6 max-w-3xl mx-auto'>
							{messages.map(msg => (
								<div
									key={msg.id}
									className={`flex ${
										msg.sender === 'user' ? 'justify-end' : 'justify-start'
									}`}>
									<div
										className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-2xl shadow-sm ${
											msg.sender === 'user'
												? 'bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 text-white'
												: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
										} ${!msg.isComplete ? 'opacity-80' : ''}`}>
										<div className='text-sm whitespace-pre-wrap leading-relaxed'>
											{msg.text}
										</div>

										{/* Car properties display */}
										{msg.carProps && msg.carProps.length > 0 && (
											<div
												className={`mt-3 pt-3 ${
													msg.sender === 'user'
														? 'border-t border-white/20'
														: 'border-t border-gray-200 dark:border-gray-700'
												}`}>
												<h4 className='font-medium text-sm mb-2'>
													Car Properties:
												</h4>
												<div className='grid grid-cols-2 gap-2'>
													{msg.carProps.map((prop, index) => (
														<div
															key={index}
															className='text-xs flex items-center'>
															<span
																className={`font-medium ${
																	msg.sender === 'user'
																		? 'text-purple-200'
																		: 'text-purple-600 dark:text-purple-400'
																}`}>
																{prop.key}:
															</span>{' '}
															<span className='ml-1'>{prop.value}</span>{' '}
															{prop.emoji && (
																<span className='ml-1'>{prop.emoji}</span>
															)}
														</div>
													))}
												</div>
											</div>
										)}

										{/* SQL Query display (collapsed by default) */}
										{msg.sqlQuery && (
											<details className='mt-2 text-xs'>
												<summary
													className={`cursor-pointer font-medium ${
														msg.sender === 'user'
															? 'text-purple-200'
															: 'text-purple-600 dark:text-purple-400'
													}`}>
													Show SQL Query
												</summary>
												<pre
													className={`mt-1 p-2 rounded overflow-x-auto text-xs ${
														msg.sender === 'user'
															? 'bg-black/20 text-white'
															: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
													}`}>
													{msg.sqlQuery}
												</pre>
											</details>
										)}

										<div
											className={`text-xs mt-2 ${
												msg.sender === 'user'
													? 'text-purple-200'
													: 'text-gray-500 dark:text-gray-400'
											}`}>
											{msg.timestamp.toLocaleTimeString()}
										</div>
									</div>
								</div>
							))}
							{isTyping && (
								<div className='flex items-center text-sm text-gray-500 dark:text-gray-400 pl-2'>
									<div className='bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700'>
										<div className='flex space-x-1'>
											<div
												className='w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-bounce'
												style={{ animationDelay: '0ms' }}></div>
											<div
												className='w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-bounce'
												style={{ animationDelay: '150ms' }}></div>
											<div
												className='w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-bounce'
												style={{ animationDelay: '300ms' }}></div>
										</div>
									</div>
									<span className='ml-2'>Alkhedr Motors is typing...</span>
								</div>
							)}
							<div ref={messagesEndRef} />
						</div>
					)}
				</div>

				{/* Input container */}
				<div className='px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-colors duration-200'>
					<div className='max-w-3xl mx-auto'>
						<div className='flex items-center'>
							<input
								type='text'
								value={message}
								onChange={e => setMessage(e.target.value)}
								onKeyPress={e => e.key === 'Enter' && sendMessage()}
								placeholder='Ask about cars...'
								disabled={!connected || !activeConversation}
								className='flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-l-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400 transition-colors'
							/>
							<button
								onClick={sendMessage}
								disabled={!connected || !activeConversation || !message.trim()}
								className='px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500 text-white rounded-r-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all'>
								<Send className='w-5 h-5' />
							</button>
						</div>
						<div className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
							{!connected && (
								<span className='text-red-500 dark:text-red-400'>
									Disconnected. Reconnecting...
								</span>
							)}
							{connected && !activeConversation && (
								<span>Select or create a conversation to start chatting</span>
							)}
							{connected && activeConversation && (
								<span>Type a message and press Enter to send</span>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ChatComponent;
