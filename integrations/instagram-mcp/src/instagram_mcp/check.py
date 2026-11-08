"""Real MCP stdio discovery check. Does not call Meta or publish anything."""
import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    params = StdioServerParameters(command=sys.executable,args=['-m','instagram_mcp'],env=dict(os.environ))
    async with stdio_client(params) as (reader,writer):
        async with ClientSession(reader,writer) as session:
            initialized = await session.initialize()
            tools = await session.list_tools()
            prompts = await session.list_prompts()
            names = {tool.name for tool in tools.tools}
            required = {'publish_reel','reply_to_comment','get_comments','confirm_action','get_action_history','prepare_studio_reel','get_studio_request_status'}
            assert required <= names, 'Отсутствуют обязательные инструменты.'
            assert 'refresh_access_token' not in names and 'refresh_tokens' not in names
            assert all(tool.description and any('а'<=c.lower()<='я' for c in tool.description) for tool in tools.tools)
            assert any(prompt.name=='instagram_assistant_ru' for prompt in prompts.prompts)
            state = await session.call_tool('connection_status',{})
            data = json.loads(state.content[0].text)
            print(json.dumps({'ok':True,'server':initialized.serverInfo.name,'tools':len(names),
                              'language':'ru','token_configured':data['token_configured'],
                              'message':'MCP запускается и отдаёт русские инструменты. Вход и публикация не выполнялись.'},ensure_ascii=False))


if __name__=='__main__':
    asyncio.run(main())
