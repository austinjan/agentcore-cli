from core.harness_client import HarnessClient


def test_accumulate_command_output():
    client = HarnessClient.__new__(HarnessClient)
    events = [
        {"chunk": {"contentDelta": {"stdout": "file1.ts\n"}}},
        {"chunk": {"contentDelta": {"stdout": "file2.ts\n"}}},
        {"chunk": {"contentDelta": {"stderr": "warning: something\n"}}},
        {"chunk": {"contentStop": {"exitCode": 0, "status": "SUCCESS"}}},
    ]
    stdout, stderr, exit_code = client._accumulate_command(events)
    assert stdout == "file1.ts\nfile2.ts\n"
    assert stderr == "warning: something\n"
    assert exit_code == 0


def test_new_session_id_format():
    sid = HarnessClient.new_session_id()
    assert len(sid) == 36
    assert sid == sid.upper()
