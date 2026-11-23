@{
    Severity     = @('Error', 'Warning')
    ExcludeRules = @(
        'PSAvoidUsingWriteHost'
        'PSAvoidUsingConvertToSecureStringWithPlainText'
        'PSUseShouldProcessForStateChangingFunctions'
    )
}
