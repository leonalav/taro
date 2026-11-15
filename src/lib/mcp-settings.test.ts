import {describe,expect,it} from 'vitest';
import {mcpConnectionError,parseMcpArguments} from './mcp-settings';
describe('MCP command argument boundaries',()=>{
  it('keeps string arguments literal, including spaces, quotes, slashes and empty arguments',()=>{
    const args=['--folder','C:\\Users\\Name With Spaces','"literal"','','$(not executed)'];
    expect(parseMcpArguments(JSON.stringify(args))).toEqual(args);
    expect(parseMcpArguments('')).toEqual([]);
  });
  it('rejects commands, nonarrays and nonstring arguments without echoing their contents',()=>{
    for(const value of ['--token secret','null','{}','[1]','[true]','["ok",{}]']){
      expect(()=>parseMcpArguments(value)).toThrow(/JSON array/);
      try{parseMcpArguments(value);}catch(error){expect(String(error)).not.toContain('secret');}
    }
  });
  it('provides connection diagnostics without exposing arbitrary server credentials',()=>{
    expect(mcpConnectionError('HTTP 401 rejected Bearer sk-private')).toContain('HTTP 401');
    for(const message of ['HTTP 401 rejected Bearer sk-private','HTTP 500 https://server.test?token=sk-private','server rejected sk-private','timeout sk-private']){
      expect(mcpConnectionError(message)).not.toContain('sk-private');
    }
    expect(mcpConnectionError('os error 2')).toContain('not found');
  });
});
